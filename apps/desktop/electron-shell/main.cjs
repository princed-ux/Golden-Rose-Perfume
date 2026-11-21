"use strict";

const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const ORIGIN = "http://127.0.0.1:1420";
const APP_URL = ORIGIN + "/";
const PRELOAD = path.join(__dirname, "preload.cjs");
const STARTUP_TIMEOUT_MS = 25000;
// The native browser test uses a disposable profile; never reuse cashier auth in tests.
if (process.env.GOLDEN_ROSE_TEST_PROFILE) {
  app.setPath("userData", path.resolve(process.env.GOLDEN_ROSE_TEST_PROFILE));
}
let cashierWindow = null;
let customerWindow = null;
let lastCustomerSale = emptySale();

function emptySale() {
  return { status: "idle", items: [], subtotalMinor: 0, discountMinor: 0, totalMinor: 0 };
}

function isLocalAppUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === ORIGIN && !url.username && !url.password;
  } catch {
    return false;
  }
}

function secureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https://")) void shell.openExternal(url).catch(() => undefined);
  });
}

function appWindowPreferences(extra = {}) {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    ...extra,
  };
}

function diagnosticPage(title, message) {
  // Only static, application-authored messages are passed into this document.
  const html = [
    "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
    "<title>Golden Rose Desktop</title><style>",
    "*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#f8f3f0;color:#472239;font:15px/1.5 'Segoe UI',Arial,sans-serif}",
    "main{width:min(100%,530px);padding:36px;border:1px solid #e8d4d5;border-radius:18px;background:white;box-shadow:0 22px 55px #4a13251b}",
    "small{color:#aa804d;font-weight:800;letter-spacing:.15em}h1{margin:10px 0;font:400 32px Georgia,serif}",
    "p{color:#745e69}code{display:block;padding:12px;border-radius:8px;overflow-wrap:anywhere;background:#f7eeee}",
    "aside{margin-top:18px;padding:14px;border-left:3px solid #aa804d;background:#fbf4ec;font-size:13px}",
    "</style></head><body><main><small>GOLDEN ROSE PERFUME · DESKTOP</small><h1>",
    title,
    "</h1><p>",
    message,
    "</p><aside>Start the desktop development server in a separate terminal:",
    "<code>cd apps\\desktop<br>npm run dev</code>",
    "Then close and reopen the Electron window.</aside></main></body></html>",
  ].join("");
  return "data:text/html;charset=UTF-8," + encodeURIComponent(html);
}

async function showDiagnostic(window, title, message) {
  if (window.isDestroyed()) return;
  try {
    await window.loadURL(diagnosticPage(title, message));
  } catch (error) {
    console.error("[Golden Rose] Cannot show startup guidance:", error);
  }
  if (!window.isDestroyed() && !window.isVisible()) window.show();
}

function rendererAvailable() {
  return new Promise((resolve) => {
    const request = http.get(
      APP_URL,
      { headers: { accept: "text/html" }, timeout: 1500 },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(false);
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 50000) response.destroy();
        });
        response.on("end", () =>
          resolve(body.includes("Golden Rose Perfume") && body.includes("src/main.tsx")),
        );
        response.on("error", () => resolve(false));
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function waitForRenderer() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await rendererAvailable()) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function watchRenderer(window) {
  window.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isLocalAppUrl(url)) return;
    console.error("[Golden Rose] Renderer load failed:", code, description);
    void showDiagnostic(
      window,
      "Desktop screen could not load",
      "The Golden Rose renderer did not respond. Check the Vite terminal for errors.",
    );
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[Golden Rose] Renderer stopped:", details.reason);
    void showDiagnostic(
      window,
      "Desktop renderer stopped",
      "The desktop interface stopped unexpectedly. Restart after checking the development terminal.",
    );
  });
}

function validateSale(value) {
  if (!value || typeof value !== "object") return null;
  if (!["idle", "shopping", "confirming", "complete"].includes(value.status)) return null;
  if (!Array.isArray(value.items) || value.items.length > 40) return null;
  for (const field of ["subtotalMinor", "discountMinor", "totalMinor"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) return null;
  }
  const items = [];
  for (const item of value.items) {
    if (!item || typeof item.name !== "string" || item.name.length > 300 ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 ||
      !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0) return null;
    items.push({ name: item.name, quantity: item.quantity, priceMinor: item.priceMinor });
  }
  if (value.discountMinor > value.subtotalMinor ||
    value.totalMinor !== value.subtotalMinor - value.discountMinor) return null;
  return {
    status: value.status, items,
    subtotalMinor: value.subtotalMinor,
    discountMinor: value.discountMinor,
    totalMinor: value.totalMinor,
  };
}

function fromCashier(event) {
  return cashierWindow && !cashierWindow.isDestroyed() &&
    event.sender === cashierWindow.webContents && isLocalAppUrl(event.sender.getURL());
}

function fromCustomerDisplay(event) {
  return customerWindow && !customerWindow.isDestroyed() &&
    event.sender === customerWindow.webContents && isLocalAppUrl(event.sender.getURL());
}

function setCustomerWindowPosition(window) {
  if (!cashierWindow || cashierWindow.isDestroyed()) return;
  const current = screen.getDisplayMatching(cashierWindow.getBounds());
  const second = screen.getAllDisplays().find((display) => display.id !== current.id);
  if (!second) return;
  window.setBounds({
    x: second.workArea.x,
    y: second.workArea.y,
    width: Math.max(900, second.workArea.width),
    height: Math.max(650, second.workArea.height),
  });
}

async function openCustomerWindow() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.show();
    customerWindow.focus();
    return;
  }
  customerWindow = new BrowserWindow({
    title: "Golden Rose · Customer Display",
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: "#f8f3f0",
    autoHideMenuBar: true,
    webPreferences: appWindowPreferences({
      // Customer window never shares cashier auth cookies or localStorage.
      partition: "golden-rose-customer-isolated",
      additionalArguments: ["--golden-rose-customer-display"],
    }),
  });
  const window = customerWindow;
  window.on("closed", () => {
    if (customerWindow === window) customerWindow = null;
  });
  setCustomerWindowPosition(window);
  secureNavigation(window);
  watchRenderer(window);
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });
  try {
    await window.loadURL(APP_URL + "?customer-display=" + randomUUID());
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  } catch {
    await showDiagnostic(
      window,
      "Customer display unavailable",
      "The customer-facing screen could not load from the desktop server.",
    );
  }
}

function attachDisplayIpc() {
  ipcMain.handle("golden-rose:open-display", async (event) => {
    if (!fromCashier(event)) throw new Error("Unauthorized display request.");
    await openCustomerWindow();
  });
  ipcMain.on("golden-rose:publish-sale", (event, value) => {
    if (!fromCashier(event)) return;
    const safe = validateSale(value);
    if (!safe) return;
    lastCustomerSale = safe;
    if (customerWindow && !customerWindow.isDestroyed())
      customerWindow.webContents.send("golden-rose:customer-sale", safe);
  });
  ipcMain.on("golden-rose:display-ready", (event) => {
    if (fromCustomerDisplay(event))
      event.sender.send("golden-rose:customer-sale", lastCustomerSale);
  });
}

async function createCashierWindow() {
  const window = new BrowserWindow({
    title: "Golden Rose Perfume",
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f8f3f0",
    webPreferences: appWindowPreferences(),
  });
  cashierWindow = window;
  window.on("closed", () => {
    if (cashierWindow === window) cashierWindow = null;
    lastCustomerSale = emptySale();
    if (customerWindow && !customerWindow.isDestroyed()) customerWindow.close();
  });
  secureNavigation(window);
  watchRenderer(window);
  await showDiagnostic(
    window,
    "Preparing the register",
    "Connecting to the Golden Rose desktop development server.",
  );

  if (!(await waitForRenderer())) {
    console.error("[Golden Rose] No Golden Rose Vite renderer at", APP_URL);
    await showDiagnostic(
      window,
      "Development server not ready",
      "No Golden Rose desktop renderer was detected at http://127.0.0.1:1420.",
    );
    return;
  }

  if (window.isDestroyed()) return;
  try {
    await window.loadURL(APP_URL);
    if (!window.isDestroyed()) window.show();
  } catch (error) {
    console.error("[Golden Rose] Could not load the desktop app:", error);
    await showDiagnostic(
      window,
      "Desktop screen could not load",
      "The renderer is running, but the window could not open it. Inspect the Vite terminal.",
    );
  }
}

app.whenReady().then(() => {
  attachDisplayIpc();
  void createCashierWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createCashierWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
