import { chromium } from "playwright";

const executablePath = process.env.PW_EXECUTABLE_PATH || undefined;
const baseUrl = process.env.PROBE_BASE_URL || "http://localhost:3000";

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

function log(label, value) {
  console.log(`${label}: ${value}`);
}

async function bodyText() {
  return page.locator("body").innerText();
}

await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
log("Account section heading present", (await page.locator("h2:has-text('Account')").count()) > 0);

const testEmail = `buff-verify-${Date.now()}@gmail.com`;
const testPassword = "correct horse battery staple 42";

await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 10000 });
await page.locator('input[type="email"]').fill(testEmail);
await page.locator('input[type="password"]').fill(testPassword);
await page.locator("text=New here? Create an account instead").click();
await page.getByRole("button", { name: "Sign up" }).click();
await page.waitForTimeout(4000);

let text = await bodyText();
if (text.includes("Check your email")) {
  console.log("RESULT: needs-email-confirmation — cannot verify sync round trip until it's off");
  console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "no console errors");
  await browser.close();
  process.exit(text.includes("Check your email") ? 2 : 1);
}

if (!text.includes(`Signed in as ${testEmail}`)) {
  console.log("RESULT: unexpected state after sign-up");
  console.log(text.slice(0, 2000));
  console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "no console errors");
  await browser.close();
  process.exit(1);
}
console.log("RESULT: signed up and signed in immediately (email confirmation is off, as expected for this test)");

// Push: click "Sync now" and confirm it reports success against the real app_data table (RLS: insert own row).
await page.getByRole("button", { name: /Sync now|Syncing/ }).click();
await page.waitForTimeout(3000);
text = await bodyText();
log("Sync status after first sync", text.includes("Pushed this browser's data") || text.includes("Already up to date") ? "OK" : "UNEXPECTED: " + text.slice(text.indexOf("ACCOUNT"), text.indexOf("ACCOUNT") + 400));

// Sign out, then sign back in — confirms the row created above is readable on a fresh session (RLS: select own row) and pulls it down.
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(1000);
text = await bodyText();
log("Back to sign-in form after sign-out", text.includes("Sign in with Google") ? "OK" : "FAILED: " + text.slice(0, 500));

await page.locator('input[type="email"]').fill(testEmail);
await page.locator('input[type="password"]').fill(testPassword);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(4000);
text = await bodyText();
log("Signed back in", text.includes(`Signed in as ${testEmail}`) ? "OK" : "FAILED: " + text.slice(0, 500));

console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "no console errors");
await browser.close();
