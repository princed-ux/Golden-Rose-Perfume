export const PROJECT_URL = "https://eixbmsethgrtezhdmgsh.supabase.co";

export interface DesktopConfig {
  url: string;
  publishableKey: string;
  workspaceUrl: string;
}

export function readConfig(env: Record<string, unknown>): DesktopConfig {
  const url =
    typeof env.VITE_SUPABASE_URL === "string"
      ? env.VITE_SUPABASE_URL.trim()
      : "";
  const key =
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
      ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : "";
  if (url !== PROJECT_URL)
    throw new Error(
      "Set VITE_SUPABASE_URL to the designated Golden Rose project.",
    );
  if (!key.startsWith("sb_publishable_"))
    throw new Error(
      "Configure the Golden Rose publishable API key. Secret keys are prohibited in the desktop client.",
    );
  const workspace = new URL(
    String(env.VITE_WORKSPACE_URL || "http://localhost:3000"),
  );
  if (
    workspace.protocol !== "https:" &&
    !(
      workspace.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(workspace.hostname)
    )
  ) {
    throw new Error(
      "The workspace address must use HTTPS or a local development server.",
    );
  }
  if (workspace.username || workspace.password)
    throw new Error("The workspace address must not include credentials.");
  return { url, publishableKey: key, workspaceUrl: workspace.origin };
}
