import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const params = new URLSearchParams(window.location.search);
if (params.has("customer-display")) {
  // This entry point never loads Supabase Auth or the staff application.
  void import("./CustomerDisplay").then(({ CustomerDisplay }) =>
    root.render(
      <StrictMode>
        <CustomerDisplay channelId={params.get("customer-display") ?? ""} />
      </StrictMode>,
    ),
  );
} else {
  void import("./App").then(({ App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
}
