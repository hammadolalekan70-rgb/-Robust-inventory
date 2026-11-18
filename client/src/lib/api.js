export class ApiError extends Error {
  constructor(message, { status = 0, code = '', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  fieldErrors() {
    const map = {};
    if (Array.isArray(this.details)) {
      for (const issue of this.details) {
        if (issue?.path && !map[issue.path]) map[issue.path] = issue.message;
      }
    }
    return map;
  }

  matches() {
    return Array.isArray(this.details?.matches) ? this.details.matches : [];
  }
}

export function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return '';
}

let csrfRequest = null;

export async function ensureCsrfToken(force = false) {
  const existing = readCookie('rwi.csrf');
  if (existing && !force) return existing;
  if (!csrfRequest) {
    csrfRequest = fetch('/api/auth/csrf', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => data.csrfToken)
      .finally(() => {
        csrfRequest = null;
      });
  }
  return csrfRequest;
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const upper = method.toUpperCase();
  const headers = {};
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upper)) {
    headers['X-CSRF-Token'] = await ensureCsrfToken();
  }

  const response = await fetch(`/api${path}`, {
    method: upper,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('rwi:unauthorized'));
    }
    const error = data?.error || {};
    throw new ApiError(error.message || `Request failed (${response.status})`, {
      status: response.status,
      code: error.code,
      details: error.details
    });
  }

  return data;
}

export const api = {
  get: (path, signal) => request(path, { signal }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' })
};

export function apiForm(path, formData, method = 'POST') {
  return request(path, { method, body: formData });
}

export async function downloadFile(path, fallbackName = 'download') {
  const response = await fetch(`/api${path}`, { credentials: 'include' });
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const data = await response.json();
      message = data?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, { status: response.status });
  }

  const disposition = response.headers.get('content-disposition') || '';
  const match =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="?([^";]+)"?/i.exec(disposition);
  let name = match ? decodeURIComponent(match[1]) : fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
