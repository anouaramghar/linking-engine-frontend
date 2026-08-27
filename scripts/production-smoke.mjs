import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const baseUrl = process.env.DASHBOARD_BASE_URL ?? "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  });
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 500)));

  const response = await page.goto(`${baseUrl}/`, {
    waitUntil: "networkidle",
    timeout: 20_000,
  });
  await page.waitForTimeout(500);

  const rendered = await page.evaluate(() => ({
    rootChildren: document.getElementById("root")?.childElementCount ?? 0,
    bodyText: document.body?.innerText?.trim().slice(0, 200) ?? "",
  }));

  assert.equal(response?.status(), 200, "dashboard HTML should load");
  assert.ok(rendered.rootChildren > 0, "dashboard root should render at least one child");
  assert.ok(rendered.bodyText, "dashboard should contain visible text");
  assert.equal(pageErrors.length, 0, `dashboard page errors: ${pageErrors.join(" | ")}`);
  assert.equal(
    consoleErrors.some((error) => error.includes("unsafe-eval")),
    false,
    `dashboard hit a CSP runtime compiler error: ${consoleErrors.join(" | ")}`,
  );

  console.log(JSON.stringify({ status: response.status(), rendered }));
} finally {
  await browser.close();
}
