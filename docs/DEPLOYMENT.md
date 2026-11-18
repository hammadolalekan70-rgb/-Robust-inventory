# Deployment

Target: a Linux VPS (Ubuntu 22.04/24.04 shown) running Node.js, MongoDB and Nginx. Windows Server works
the same way with a service wrapper such as NSSM, but the examples below are Linux.

The app is deliberately a single Node process: it serves the React build and the API.

---

## 1. Production checklist

- [ ] Node.js 20.11+ and MongoDB 7.x installed
- [ ] Dedicated OS user runs the app (not root)
- [ ] `.env` with a strong `SESSION_SECRET` (64 hex characters)
- [ ] `APP_BASE_URL` and `CLIENT_ORIGINS` set to the public HTTPS origin
- [ ] `COOKIE_SECURE=true`, `TRUST_PROXY=1` (behind one Nginx hop)
- [ ] `SESSION_TTL_HOURS` reviewed (default 8)
- [ ] `npm run build` completed and `client/dist` present
- [ ] SMTP configured and tested (sign-in codes and password resets)
- [ ] MongoDB listens on localhost only / firewall restricted
- [ ] TLS certificate installed; HTTP redirects to HTTPS
- [ ] Health check monitored (`/api/health`)
- [ ] First boss account created; demo/test accounts removed

---

## 2. Server preparation

```bash
sudo apt update
sudo apt install -y nginx mongodb-org
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Create a service user and directories:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin rwi
sudo mkdir -p /srv/robust-warehouse
sudo chown -R rwi:rwi /srv/robust-warehouse
sudo -u rwi git clone <repository-url> /srv/robust-warehouse/app   # or copy the folder
```

MongoDB: keep the default local bind. If you enable authentication, update `MONGODB_URI` to include the
credentials and the `authSource`.

---

## 3. Configure and build

```bash
cd /srv/robust-warehouse/app
sudo -u rwi npm ci
sudo -u rwi cp .env.example .env
sudo -u rwi nano .env
```

Production `.env` essentials:

```dotenv
NODE_ENV=production
PORT=4000
APP_BASE_URL=https://inventory.example.com
CLIENT_ORIGINS=https://inventory.example.com
MONGODB_URI=mongodb://127.0.0.1:27017/robust_warehouse_inventory

SESSION_SECRET=<64 hex characters>
SESSION_TTL_HOURS=8
COOKIE_SECURE=true
TRUST_PROXY=1

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=<app password>
MAIL_FROM="Robust Warehouse Inventory <you@example.com>"

```

Build and create the boss:

```bash
sudo -u rwi npm run build
sudo -u rwi npm run create-admin -- --name "Boss Admin" --email boss@example.com --password "…"
sudo -u rwi npx --workspace server vitest run   # optional pre-flight test run
```

Verify both directories are writable by `rwi`:

```bash
ls -ld /srv/robust-warehouse/app/uploads
```

---

## 4. systemd service

Create `/etc/systemd/system/rwi.service`:

```ini
[Unit]
Description=Robust Warehouse Inventory
After=network.target mongod.service
Wants=network.target

[Service]
Type=simple
User=rwi
Group=rwi
WorkingDirectory=/srv/robust-warehouse/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/robust-warehouse

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rwi
sudo systemctl status rwi
curl -s http://127.0.0.1:4000/api/health
```

Logs: `journalctl -u rwi -f`.

---

## 5. Nginx reverse proxy + TLS

`/etc/nginx/sites-available/rwi`:

```nginx
server {
    listen 80;
    server_name inventory.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name inventory.example.com;

    ssl_certificate     /etc/letsencrypt/live/inventory.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inventory.example.com/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location = /api/health {
        proxy_pass http://127.0.0.1:4000;
        access_log off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/rwi /etc/nginx/sites-enabled/rwi
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d inventory.example.com
```

`TRUST_PROXY=1` lets Express see the client IP through Nginx (used by rate limiting and audit logs).
With TLS enabled, `COOKIE_SECURE=true` is mandatory.

---

## 6. Operations

### Monitoring

- Health endpoint: `GET /api/health` → `{ "status": "ok", "database": "connected" }`.
- Alert on non-200 responses.
- Disk space: uploads grow over time.

### Upgrades

```bash
sudo systemctl stop rwi
sudo -u rwi git pull
sudo -u rwi npm ci
sudo -u rwi npm run build
sudo -u rwi npm test
sudo systemctl start rwi
curl -s https://inventory.example.com/api/health
```

Run migrations are not required; Mongoose indexes are created automatically.

### Rotating secrets

- **SESSION_SECRET** — changing it signs everyone out. That is a valid emergency response.

---

## 7. Hardening summary

- Bind MongoDB to `127.0.0.1`; do not expose 27017.
- Only expose ports 80/443. Node listens on localhost behind Nginx.
- Use a non-root service user with write access only to the app directory.
- Keep `.env` mode `600`; never commit it.
- Enable `unattended-upgrades` for OS security patches.
- Consider fail2ban for repeated login attempts (application rate limits also apply).
- Set `SESSION_TTL_HOURS` conservatively for shared warehouse machines.
- Restrict boss accounts to people who need user/audit access.

---

## 8. Windows Server notes

- Install Node.js LTS and MongoDB as services.
- Use [NSSM](https://nssm.cc/) to run `node server\src\server.js` as a service with the repo as its
  working directory; set `NODE_ENV=production`.
- Use IIS with URL Rewrite + ARR as a reverse proxy, or expose the Node port only on the LAN behind a
  firewall. Set `TRUST_PROXY` to match the number of proxy hops.
- Ensure the service account can write to `uploads`.
