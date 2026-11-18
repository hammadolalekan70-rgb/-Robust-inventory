import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = '26 October 2026';

function LegalShell({ title, children }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link to="/">
            <img src="/logo-horizontal.svg" alt="Robust Warehouse Inventory" className="h-10 w-auto" />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-dark sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Last updated {LAST_UPDATED}
        </p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-600">{children}</div>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Robust Warehouse Inventory</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-medium">
            <Link to="/privacy" className="transition hover:text-brand">
              Privacy
            </Link>
            <Link to="/terms" className="transition hover:text-brand">
              Terms
            </Link>
            <a href="tel:+2348065931553" className="transition hover:text-brand">
              Contact · 0806 593 1553
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy">
      <Section title="Scope">
        <p>
          Robust Warehouse Inventory is an internal business application for recording purchases and
          managing warehouse spending. This policy explains what information the application holds,
          why it is held and who can access it.
        </p>
      </Section>

      <Section title="Information we hold">
        <p>
          Account details: your name, email address, role and a hashed password. Purchase records:
          suppliers, products, quantities, prices, dates, notes, receipts and the staff member who
          recorded each entry. Operational records: audit events describing actions taken in the
          application, revision history for corrected purchases and soft-deleted records.
        </p>
      </Section>

      <Section title="How information is used">
        <p>
          The information is used only to operate the service: authenticating users, enforcing
          permissions, recording and reporting purchases, maintaining an audit trail and sending
          password-reset emails.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          The application uses an essential session cookie to keep you signed in and a CSRF token to
          protect form submissions. It does not use advertising or analytics cookies.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          Your data is not sold or shared for marketing. It may be processed by infrastructure
          configured by the operator of this installation, such as an email delivery provider for
          password resets. Access inside the application is limited by role.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          Records are kept for as long as the business requires them. Deleted purchases are moved to
          the trash and can be restored until permanently purged.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Passwords are stored as hashes and permissions are enforced on the server. No system is
          perfectly secure, so report suspected unauthorised access immediately.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          To access, correct or request deletion of your information, contact the administrator of
          this installation. Some records may need to be retained to meet accounting or audit
          obligations.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy can be directed to{' '}
          <a href="tel:+2348065931553" className="font-semibold text-brand hover:underline">
            0806 593 1553
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

export function TermsOfUse() {
  return (
    <LegalShell title="Terms of Use">
      <Section title="Acceptance">
        <p>
          By using Robust Warehouse Inventory you agree to these terms. If you do not agree, do not
          use the application.
        </p>
      </Section>

      <Section title="Accounts and access">
        <p>
          Accounts are created and administered by the operator. Keep your password confidential and
          report suspected unauthorised use to your administrator promptly. Access may be suspended
          when it is no longer required or when these terms are breached.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Use the application only for legitimate purchase and spending records. Do not attempt to
          bypass permissions, interfere with the service, upload malicious files or use the system for
          unlawful purposes.
        </p>
      </Section>

      <Section title="Records and accuracy">
        <p>
          You are responsible for the accuracy of the information you enter. Business records remain
          the property of the operator of this installation.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          The application is provided on an as-is basis. Continuous availability is not guaranteed.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          The application, its design and branding remain the property of their respective owner.
          These terms do not grant you any rights to copy or redistribute the software.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, the operator is not liable for indirect or consequential
          loss arising from use of the application. Nothing in these terms excludes liability that
          cannot lawfully be excluded.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms may be updated as the application changes. Questions can be directed to{' '}
          <a href="tel:+2348065931553" className="font-semibold text-brand hover:underline">
            0806 593 1553
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
