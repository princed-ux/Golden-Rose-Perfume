import { test, expect, _electron } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { backend, login, products } from "./fixtures";

test("existing Electron shell opens an isolated customer monitor and synchronizes the sale", async ({}, info) => {
  test.setTimeout(60_000);
  const profile = await mkdtemp(
    join(tmpdir(), "golden-rose-desktop-acceptance-"),
  );
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && name !== "ELECTRON_RUN_AS_NODE")
      env[name] = value;
  }
  env.GOLDEN_ROSE_TEST_PROFILE = profile;
  const electronPath = resolve("node_modules/electron/dist/electron.exe");
  expect(existsSync(electronPath), "Electron binary was not installed").toBe(true);
  const binary = spawnSync(electronPath, ["--version"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
  console.log("Electron binary preflight:", JSON.stringify({
    status: binary.status,
    signal: binary.signal,
    error: binary.error?.message,
    stdout: String(binary.stdout).slice(0, 400),
    stderr: String(binary.stderr).slice(0, 400),
  }));
  const application = await _electron.launch({
    executablePath: electronPath,
    args: ["--disable-gpu", "electron-shell"],
    env,
    timeout: 20_000,
  });
  try {
    const cashier = await application.firstWindow();
    // Verify Electron itself rendered the login page before any test navigation.
    // Previously the initial window could remain completely white while the
    // browser-only fixture passed after navigating directly to the Vite URL.
    await expect(
      cashier.getByRole("heading", { name: "Staff sign in", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await backend(cashier);
    await login(cashier);
    await cashier
      .getByRole("button", { name: "Add " + products[0].name, exact: true })
      .click();
    await cashier
      .getByRole("button", { name: "Customer display", exact: true })
      .click();
    const customer = async (expression: string) =>
      application.evaluate(async ({ BrowserWindow }, expression) => {
        const window = BrowserWindow.getAllWindows().find((item) =>
          item.webContents.getURL().includes("customer-display"),
        );
        return window ? window.webContents.executeJavaScript(expression) : null;
      }, expression);
    await expect
      .poll(() =>
        customer("document.querySelector('.customer-total')?.textContent"),
      )
      .toBe("₦12,500");
    expect(
      await customer("localStorage.getItem('golden-rose-desktop-auth')"),
    ).toBeNull();
    expect(await customer("typeof window.goldenRoseDisplay?.open")).toBe(
      "undefined",
    );
    expect(await customer("document.querySelectorAll('button').length")).toBe(
      0,
    );
    expect(await customer("document.body.textContent")).not.toContain(
      "fixture@example.test",
    );
    // Electron's compositor capture also works for hidden, isolated test windows.
    const cashierPng = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(
        (item) => !item.webContents.getURL().includes("customer-display"),
      )!;
      return (await window.capturePage()).toPNG().toString("base64");
    });
    await writeFile(
      info.outputPath("native-cashier.png"),
      Buffer.from(cashierPng, "base64"),
    );
    const png = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().includes("customer-display"),
      )!;
      return (await window.capturePage()).toPNG().toString("base64");
    });
    await writeFile(
      info.outputPath("native-customer-display.png"),
      Buffer.from(png, "base64"),
    );
    await cashier
      .getByRole("button", { name: "Add " + products[0].name, exact: true })
      .click();
    await expect
      .poll(() =>
        customer("document.querySelector('.customer-total')?.textContent"),
      )
      .toBe("₦25,000");
    await cashier
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect
      .poll(() =>
        customer("document.querySelector('.customer-welcome h2')?.textContent"),
      )
      .toBe("Find your signature fragrance.");
  } finally {
    await application.close();
  }
});
