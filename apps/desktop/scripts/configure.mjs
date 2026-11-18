import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

const destination = new URL("../.env.local", import.meta.url);
if (existsSync(destination)) {
  console.log("Desktop environment already exists. Existing values preserved.");
} else {
  const source = parseEnv(
    readFileSync(new URL("../../../.env.local", import.meta.url), "utf8"),
  );
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (
    url !== "https://eixbmsethgrtezhdmgsh.supabase.co" ||
    !key?.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "Configure the designated Golden Rose URL and publishable key in the web environment first.",
    );
  }
  const workspace =
    source.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  const parsed = new URL(workspace);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
  ) {
    throw new Error(
      "The workspace URL must use HTTPS or a loopback development address.",
    );
  }
  writeFileSync(
    destination,
    [
      "VITE_SUPABASE_URL=" + url,
      "VITE_SUPABASE_PUBLISHABLE_KEY=" + key,
      "VITE_WORKSPACE_URL=" + parsed.origin,
      "",
    ].join("\n"),
    { flag: "wx" },
  );
  console.log(
    "Desktop environment prepared using only the public project URL and publishable key.",
  );
}

// Native capabilities and network access follow the explicitly configured web origin.
const configured = parseEnv(readFileSync(destination, "utf8"));
const workspaceOrigin = new URL(
  configured.VITE_WORKSPACE_URL || "http://localhost:3000",
).origin;
const configPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const native = JSON.parse(readFileSync(configPath, "utf8"));
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://eixbmsethgrtezhdmgsh.supabase.co; connect-src 'self' ipc: http://ipc.localhost https://eixbmsethgrtezhdmgsh.supabase.co ${workspaceOrigin}; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'`;
native.app.security.csp = csp;
native.app.security.devCsp = csp.replace(
  "connect-src 'self'",
  "connect-src 'self' http://127.0.0.1:1420 ws://127.0.0.1:1420",
);
writeFileSync(configPath, JSON.stringify(native, null, 2) + "\n");
const capabilityPath = new URL(
  "../src-tauri/capabilities/default.json",
  import.meta.url,
);
const capabilities = JSON.parse(readFileSync(capabilityPath, "utf8"));
capabilities.permissions = [
  "core:default",
  "core:webview:allow-create-webview-window",
  "core:window:allow-show",
  "core:window:allow-set-focus",
  {
    identifier: "opener:allow-open-url",
    allow: [{ url: workspaceOrigin + "/workspace*" }],
  },
];
writeFileSync(capabilityPath, JSON.stringify(capabilities, null, 2) + "\n");
