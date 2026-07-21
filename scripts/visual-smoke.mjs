import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8080";
const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const landing = await desktop.newPage();
  await landing.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await landing.getByRole("heading", { name: /Дарите радость/ }).waitFor();
  if ((await landing.locator("body").innerText()).includes("Тайный Санта")) {
    throw new Error("Removed Secret Santa content is still visible on the landing page");
  }
  await landing.waitForTimeout(2500);
  await landing.screenshot({ path: "/tmp/rollapp-landing.png", fullPage: true });

  const loginResponse = await desktop.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  if (!loginResponse.ok()) throw new Error(`Demo login failed: ${loginResponse.status()}`);
  const dashboard = await desktop.newPage();
  await dashboard.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
  await dashboard.getByRole("heading", { name: /Привет, Алиса/ }).waitFor();
  if ((await dashboard.locator("body").innerText()).includes("Тайный Санта")) {
    throw new Error("Removed Secret Santa content is still visible in the authenticated app");
  }
  if (await dashboard.locator(".mobile-bottom-nav a").count() !== 5) {
    throw new Error("Mobile navigation should contain the five remaining app sections");
  }
  await dashboard.waitForTimeout(2500);
  await dashboard.screenshot({ path: "/tmp/rollapp-dashboard.png", fullPage: true });

  await dashboard.goto(`${baseUrl}/app/santa`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app");
  await dashboard.getByRole("heading", { name: /Привет, Алиса/ }).waitFor();
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobileLanding = await mobile.newPage();
  await mobileLanding.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobileLanding.getByRole("heading", { name: /Дарите радость/ }).waitFor();
  await mobileLanding.waitForTimeout(1500);
  await mobileLanding.screenshot({ path: "/tmp/rollapp-mobile.png", fullPage: true });
  await mobile.close();

  console.log("Visual smoke passed: landing, authenticated dashboard, and mobile layout rendered");
} finally {
  await browser.close();
}
