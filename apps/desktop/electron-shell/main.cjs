const { app, BrowserWindow, shell } = require("electron");

const { ipcMain, screen } = require("electron");
const path = require("node:path");
if (process.env.GOLDEN_ROSE_TEST_PROFILE)
  app.setPath("userData", process.env.GOLDEN_ROSE_TEST_PROFILE);
const APP_URL = "http://127.0.0.1:1420/";
let mainWindow;
let customerWindow;
let lastCustomerSale;

function publicSale(value) {
  if (
    !value ||
    !["shopping", "confirming", "complete", "idle"].includes(value.status) ||
    !Array.isArray(value.items) ||
    value.items.length > 40 ||
    ![value.subtotalMinor, value.discountMinor, value.totalMinor].every(
      (amount) => Number.isSafeInteger(amount) && amount >= 0,
    ) ||
    value.items.some(
      (item) =>
        !item ||
        typeof item.name !== "string" ||
        item.name.length > 300 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100 ||
        !Number.isSafeInteger(item.priceMinor) ||
        item.priceMinor < 0,
    )
  )
    return null;
  return {
    status: value.status,
    items: value.items.map(({ name, quantity, priceMinor }) => ({
      name,
      quantity,
      priceMinor,
    })),
    subtotalMinor: value.subtotalMinor,
    discountMinor: value.discountMinor,
    totalMinor: value.totalMinor,
  };
}

function openCustomerWindow() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.show();
    customerWindow.focus();
    return;
  }
  const active = screen.getDisplayMatching(mainWindow.getBounds());
  const second = screen
    .getAllDisplays()
    .find((display) => display.id !== active.id);
  customerWindow = new BrowserWindow({
    title: "Golden Rose — Customer Display",
    width: 1100,
    height: 760,
    ...(second ? { ...second.bounds, fullscreen: true } : {}),
    autoHideMenuBar: true,
    show: process.env.GOLDEN_ROSE_TEST_PROFILE ? false : true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: ["--golden-rose-customer-display"],
      partition: "golden-rose-customer-display",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  customerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  customerWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  customerWindow.loadURL(APP_URL + "?customer-display=electron");
}

ipcMain.handle("golden-rose:open-display", (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id)
    throw new Error("Display access denied.");
  openCustomerWindow();
});
ipcMain.on("golden-rose:publish-sale", (event, value) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  const sale = publicSale(value);
  if (!sale) return;
  lastCustomerSale = sale;
  if (customerWindow && !customerWindow.isDestroyed())
    customerWindow.webContents.send("golden-rose:customer-sale", sale);
});
ipcMain.on("golden-rose:display-ready", (event) => {
  if (
    customerWindow &&
    !customerWindow.isDestroyed() &&
    event.sender.id === customerWindow.webContents.id &&
    lastCustomerSale
  )
    event.sender.send("golden-rose:customer-sale", lastCustomerSale);
});

function createWindow() {
  const win = new BrowserWindow({
    title: "Golden Rose Perfume",
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 650,
    autoHideMenuBar: true,
    show: process.env.GOLDEN_ROSE_TEST_PROFILE ? false : true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = win;
  win.on("closed", () => {
    if (customerWindow && !customerWindow.isDestroyed()) customerWindow.close();
    mainWindow = null;
    lastCustomerSale = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      if (url.startsWith("https://")) {
        void shell.openExternal(url);
      }
    }
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
