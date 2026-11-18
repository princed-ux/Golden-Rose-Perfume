import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import {
  createDesktopApi,
  type Access,
  type DesktopApi,
  type StaffIdentity,
} from "./api";
import { readConfig } from "./config";
import {
  ROLE_MODULES,
  WORKSPACE_MODULES,
  type WorkspaceModuleId,
} from "./domain";
import {
  newPasswordError,
  NEW_PASSWORD_HINT,
} from "../../../src/lib/customer/auth-policy";
import { Register } from "./Register";

function setup():
  | { api: DesktopApi; error?: never }
  | { api?: never; error: string } {
  try {
    return { api: createDesktopApi(readConfig(import.meta.env)) };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Desktop configuration is missing.",
    };
  }
}

const configured = setup();
const roleNames = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  inventory_staff: "Inventory Staff",
  sales_staff: "Sales Staff",
  accountant: "Accountant",
};
const modulePaths: Partial<Record<WorkspaceModuleId, string>> = {
  overview: "",
  orders: "orders",
  invoices: "invoices",
  products: "products",
  inventory: "inventory",
  purchases: "purchases",
  suppliers: "suppliers",
  customers: "customers",
  reports: "reports",
  assistant: "assistant",
  staff: "staff",
  settings: "settings",
  expenses: "expenses",
  audit: "audit",
};

export function App() {
  const [access, setAccess] = useState<Access | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(configured.error ?? "");
  const sequence = useRef(0);
  const verify = useCallback(async () => {
    if (!configured.api) {
      setChecking(false);
      return;
    }
    const run = ++sequence.current;
    try {
      const {
        data: { session },
      } = await configured.api.auth.auth.getSession();
      const next = session ? await configured.api.verify() : null;
      if (run === sequence.current) {
        setAccess(next);
        setError("");
      }
    } catch (issue) {
      if (run === sequence.current) {
        setAccess(null);
        setError(
          issue instanceof Error
            ? issue.message
            : "Staff access could not be checked.",
        );
      }
    } finally {
      if (run === sequence.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void verify(), 0);
    if (!configured.api) return () => clearTimeout(initialCheck);
    // Schedule outside the Auth callback to avoid locking Supabase's session refresh.
    const {
      data: { subscription },
    } = configured.api.auth.auth.onAuthStateChange(() => {
      window.setTimeout(() => void verify(), 0);
    });
    const interval = window.setInterval(() => void verify(), 60_000);
    const focused = () => void verify();
    window.addEventListener("focus", focused);
    return () => {
      clearTimeout(initialCheck);
      subscription.unsubscribe();
      clearInterval(interval);
      window.removeEventListener("focus", focused);
    };
  }, [verify]);

  async function logout() {
    if (!configured.api) return;
    const { error: issue } = await configured.api.auth.auth.signOut({
      scope: "local",
    });
    if (issue) {
      setError(
        "Sign-out could not be confirmed. Retry before leaving this device.",
      );
      return;
    }
    ++sequence.current;
    setAccess(null);
    setError("");
  }

  if (checking)
    return (
      <main className="loading-screen">
        <img src="/golden-rose-logo.png" alt="Golden Rose Perfume" />
        <p role="status">Verifying your staff session…</p>
      </main>
    );
  if (!access || !configured.api)
    return <Login api={configured.api} onSignedIn={verify} error={error} />;
  if (access.kind === "enrollment")
    return (
      <PasswordEnrollment
        api={configured.api}
        email={access.email}
        logout={logout}
        onChanged={() => {
          setAccess(null);
          setError("Password changed. Sign in again with your new password.");
        }}
      />
    );
  return (
    <StaffWorkspace
      key={access.staff.id}
      api={configured.api}
      staff={access.staff}
      logout={logout}
      error={error}
    />
  );
}

function Login({
  api,
  onSignedIn,
  error,
}: {
  api?: DesktopApi;
  onSignedIn: () => Promise<void>;
  error: string;
}) {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const { error: issue } = await api.auth.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (issue)
        throw new Error(
          issue.status === 429
            ? "Too many attempts. Please wait before trying again."
            : issue.code === "email_not_confirmed"
              ? "Confirm your work email before signing in."
              : "Your work email or password was not accepted.",
        );
      await onSignedIn();
    } catch (issue) {
      setMessage(
        issue instanceof Error
          ? issue.message
          : "Sign-in could not reach Golden Rose.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-brand">
        <img
          src="/golden-rose-logo.png"
          alt="Golden Rose Perfume — Beauty of Fragrance"
        />
        <div>
          <span className="eyebrow">Golden Rose retail</span>
          <h1>
            A beautiful day
            <br />
            for business.
          </h1>
          <p>Your store, your team, one connected inventory.</p>
        </div>
        <span className="brand-caption">
          Golden Rose Perfume · Staff application
        </span>
      </section>
      <section className="login-form">
        <div className="login-card">
          <ShieldCheck size={30} className="gold" />
          <span className="eyebrow">Welcome to work</span>
          <h2>Staff sign in</h2>
          <p>
            Use your individual work account to open your authorized workspace.
          </p>
          <form onSubmit={login} aria-busy={pending}>
            <fieldset disabled={pending || !api}>
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  maxLength={254}
                  required
                  autoFocus
                />
              </label>
              <label>
                Password
                <span className="password-input">
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    maxLength={256}
                    required
                  />
                  <button
                    type="button"
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>
              {(message || error) && (
                <p className="notice error" role="alert">
                  {message || error}
                </p>
              )}
              <button className="primary" type="submit">
                {pending ? "Verifying access…" : "Sign in"}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
          <p className="fine-print">
            Accounts are managed by the business owner. Contact the owner if
            your access or temporary password needs attention.
          </p>
        </div>
      </section>
    </main>
  );
}

function PasswordEnrollment({
  api,
  email,
  logout,
  onChanged,
}: {
  api: DesktopApi;
  email: string;
  logout: () => Promise<void>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get("password")),
      confirmation = String(form.get("confirmation"));
    const invalid = newPasswordError(next, confirmation);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.replacePassword(
        String(form.get("currentPassword")),
        next,
        confirmation,
      );
      onChanged();
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "Password setup could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="enrollment">
      <section className="panel">
        <img
          className="compact-logo"
          src="/golden-rose-logo.png"
          alt="Golden Rose Perfume"
        />
        <h1>Set your own password</h1>
        <p>{email}</p>
        <p>Replace the temporary password before opening the register.</p>
        <form onSubmit={change}>
          <fieldset disabled={busy}>
            <label>
              Current temporary password
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmation"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <small>{NEW_PASSWORD_HINT}</small>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="primary">
              {busy ? "Updating…" : "Change password"}
            </button>
          </fieldset>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function StaffWorkspace({
  api,
  staff,
  logout,
  error,
}: {
  api: DesktopApi;
  staff: StaffIdentity;
  logout: () => Promise<void>;
  error: string;
}) {
  const [module, setModule] = useState<WorkspaceModuleId>(
    staff.role === "cashier"
      ? "pos"
      : staff.role === "inventory_staff"
        ? "inventory"
        : staff.role === "sales_staff"
          ? "orders"
          : staff.role === "accountant"
            ? "invoices"
            : "overview",
  );
  const [launchError, setLaunchError] = useState("");
  const allowed = ROLE_MODULES[staff.role];
  async function openModule(id: WorkspaceModuleId) {
    try {
      const access = await api.verify();
      if (
        access.kind !== "staff" ||
        !ROLE_MODULES[access.staff.role].includes(id)
      )
        throw new Error("Your active role cannot open this module.");
      const url = new URL(
        "/workspace/" + (modulePaths[id] ?? id),
        api.config.workspaceUrl,
      ).href;
      const { isTauri } = await import("@tauri-apps/api/core");
      if (isTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else window.open(url, "_blank", "noopener,noreferrer");
    } catch (issue) {
      setLaunchError(
        issue instanceof Error
          ? issue.message
          : "The module could not be opened.",
      );
    }
  }
  return (
    <div
      className={
        "desktop-app" + (staff.role === "cashier" ? " cashier-app" : "")
      }
    >
      {staff.role !== "cashier" && (
        <aside className="module-sidebar">
          <img src="/golden-rose-logo.png" alt="Golden Rose Perfume" />
          <p className="eyebrow">Business workspace</p>
          <nav aria-label="Authorized modules">
            {WORKSPACE_MODULES.filter((item) => allowed.includes(item.id)).map(
              (item) => (
                <button
                  key={item.id}
                  className={module === item.id ? "selected" : ""}
                  onClick={() => setModule(item.id)}
                >
                  {item.id === "pos" ? (
                    <ShoppingBag size={17} />
                  ) : (
                    <span className="nav-dot" />
                  )}
                  {item.label}
                </button>
              ),
            )}
          </nav>
          <small>{roleNames[staff.role]}</small>
        </aside>
      )}
      <main className="app-content">
        {module === "pos" ? (
          <Register key={staff.id} api={api} staff={staff} logout={logout} />
        ) : (
          <>
            <header className="workspace-header">
              <div>
                <span className="eyebrow">Golden Rose Perfume</span>
                <h1>
                  {WORKSPACE_MODULES.find((item) => item.id === module)?.label}
                </h1>
              </div>
              <div className="identity">
                <span>
                  <strong>{staff.name}</strong>
                  <small>{roleNames[staff.role]}</small>
                </span>
                <button onClick={() => void logout()}>
                  <LogOut size={17} /> Sign out
                </button>
              </div>
            </header>
            {(error || launchError) && (
              <p className="notice error" role="alert">
                {error || launchError}
              </p>
            )}
            <section className="workspace-welcome">
              <span className="eyebrow">Your business, connected</span>
              <h2>Welcome, {staff.name.split(" ")[0]}.</h2>
              <p>
                Open the dedicated desktop register or continue in your
                authorized Golden Rose web modules.
              </p>
              {allowed.includes("pos") && (
                <button className="primary" onClick={() => setModule("pos")}>
                  Open register
                  <ArrowRight size={18} />
                </button>
              )}
            </section>
            <section className="module-cards">
              {WORKSPACE_MODULES.filter(
                (item) => allowed.includes(item.id) && item.id !== "overview",
              ).map((item) => (
                <article className="panel" key={item.id}>
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                  <button
                    onClick={() =>
                      item.id === "pos"
                        ? setModule("pos")
                        : void openModule(item.id)
                    }
                  >
                    Open {item.label}
                    <ArrowRight size={16} />
                  </button>
                </article>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
