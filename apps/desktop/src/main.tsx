import {
  Component,
  StrictMode,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Golden Rose desktop root element is missing.");
}
const root = createRoot(container);

const panel: CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "#f8f3f0",
  color: "#472239",
};

const card: CSSProperties = {
  width: "min(100%, 520px)",
  background: "#fff",
  padding: 34,
  border: "1px solid #e8d4d5",
  borderRadius: 16,
  boxShadow: "0 20px 60px #4a13251a",
};

function StartupStatus() {
  return (
    <main style={panel} role="status" aria-live="polite">
      <section style={card}>
        <span style={{ color: "#a27b46", fontWeight: 800, letterSpacing: ".14em", fontSize: 11 }}>
          GOLDEN ROSE PERFUME
        </span>
        <h1 style={{ font: "400 30px Georgia, serif", margin: "12px 0 8px" }}>
          Opening your workspace
        </h1>
        <p style={{ color: "#74616b", marginBottom: 0 }}>
          Preparing the secure desktop register…
        </p>
      </section>
    </main>
  );
}

function StartupFailure({ details }: { details?: string }) {
  return (
    <main style={panel} role="alert">
      <section style={card}>
        <span style={{ color: "#a27b46", fontWeight: 800, letterSpacing: ".14em", fontSize: 11 }}>
          GOLDEN ROSE PERFUME · DESKTOP
        </span>
        <h1 style={{ font: "400 30px Georgia, serif", margin: "12px 0 8px" }}>
          Desktop interface could not load
        </h1>
        <p style={{ color: "#74616b" }}>
          The desktop application encountered a renderer error. Your sales
          records were not modified by this screen. Check the desktop terminal
          for details, then retry.
        </p>
        {details && (
          <pre
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#f7eeee",
              color: "#773a4d",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {details}
          </pre>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            minHeight: 44,
            padding: "10px 18px",
            borderRadius: 8,
            background: "#491027",
            color: "white",
            border: "1px solid #491027",
            fontWeight: 700,
          }}
        >
          Retry opening the register
        </button>
      </section>
    </main>
  );
}

class DesktopErrorBoundary extends Component<
  { children: ReactNode },
  { failure: Error | null }
> {
  state = { failure: null as Error | null };

  static getDerivedStateFromError(failure: Error) {
    return { failure };
  }

  componentDidCatch(failure: Error, info: ErrorInfo) {
    // Report details to the renderer console without exposing credentials.
    console.error("[Golden Rose] Desktop render failed:", failure, info.componentStack);
  }

  render() {
    if (this.state.failure) {
      return (
        <StartupFailure
          details={import.meta.env.DEV ? this.state.failure.message : undefined}
        />
      );
    }
    return this.props.children;
  }
}

root.render(<StartupStatus />);

async function start() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("customer-display")) {
      // The customer monitor does not import the authenticated staff application.
      const { CustomerDisplay } = await import("./CustomerDisplay");
      root.render(
        <StrictMode>
          <DesktopErrorBoundary>
            <CustomerDisplay channelId={params.get("customer-display") ?? ""} />
          </DesktopErrorBoundary>
        </StrictMode>,
      );
      return;
    }

    const { App } = await import("./App");
    root.render(
      <StrictMode>
        <DesktopErrorBoundary>
          <App />
        </DesktopErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    console.error("[Golden Rose] Desktop startup failed:", error);
    root.render(
      <StartupFailure
        details={
          import.meta.env.DEV && error instanceof Error
            ? error.message
            : undefined
        }
      />,
    );
  }
}

void start();
