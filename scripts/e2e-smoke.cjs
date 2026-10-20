/* eslint-disable @typescript-eslint/no-require-imports */
// End-to-end smoke test of the full order lifecycle through the UI.
// Requires a running app (npm run dev) seeded with demo accounts and PAYMENTS_PROVIDER=sandbox.
// Usage: npm run test:e2e   (set CHROMIUM_PATH if Playwright browsers are not installed)
const { chromium } = require("playwright");
const B = process.env.BASE_URL || "http://localhost:3000";
const SHOT = (n) => `${process.env.SHOT_DIR || require("os").tmpdir()}/redline-e2e-${n}.png`;
async function login(browser, email, pw) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR", email, e.message));
  await page.goto(B + "/login");
  await page.fill("#email", email); await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return page;
}
const step = (s) => console.log("✓", s);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const cust = await login(browser, "customer@redline.local", "Password123!");
  const prov = await login(browser, "provider@redline.local", "Password123!");

  // Customer creates a coaching order
  await cust.goto(B + "/dashboard/orders/new?service=valorant-coaching");
  await cust.selectOption("#ctype", "VOD_REVIEW");
  await cust.selectOption("#len", "90");
  await cust.fill("#sessions", "2");
  await cust.fill("#goals", "Review my Ascent attack rounds on Jett.");
  await cust.waitForFunction(() => document.body.innerText.includes("$60.00"));
  step("live minimum shows $60.00 (3h × $20 VOD)");
  await cust.fill("#budget", "10");
  await cust.waitForTimeout(300);
  const disabled = await cust.isDisabled("text=Post order for offers");
  if (!disabled) throw new Error("budget below min should disable submit");
  step("budget below minimum blocks submission");
  await cust.fill("#budget", "80");
  await cust.screenshot({ path: SHOT("1-create"), fullPage: true });
  await Promise.all([cust.waitForURL(/\/dashboard\/orders\/c/), cust.click("text=Post order for offers")]);
  const orderUrl = cust.url().split("?")[0];
  step("order created " + orderUrl);

  // Provider bids below minimum (server rejects), then valid
  await prov.goto(orderUrl);
  await prov.fill("#price", "45");
  await prov.fill("#message", "Ex-Immortal Jett main, I'll timestamp every mistake.");
  await prov.click("text=Submit offer");
  await prov.waitForSelector("text=/at least the minimum/");
  step("server rejected offer below minimum");
  await prov.fill("#price", "70");
  await prov.click("text=Submit offer");
  await prov.waitForSelector("text=Offer submitted");
  step("provider offer submitted at $70");

  // Customer compares and accepts
  await cust.goto(orderUrl + "?tab=offers");
  await cust.screenshot({ path: SHOT("2-offers"), fullPage: true });
  await cust.click("text=Choose provider");
  await Promise.all([cust.waitForURL(/checkout\/sandbox/), cust.click("text=Continue to payment")]);
  step("redirected to sandbox checkout");
  await Promise.all([cust.waitForURL(/checkout=success/), cust.click("text=Simulate successful payment")]);
  await cust.waitForSelector("text=Payment confirmed");
  step("payment confirmed server-side, provider assigned");

  // Messaging
  await cust.goto(orderUrl + "?tab=messages");
  await cust.fill("textarea[aria-label=Message]", "Hi! VODs uploaded, see you Thursday.");
  await cust.click("button:has-text('Send')");
  await cust.waitForSelector("text=VODs uploaded");
  await prov.goto(orderUrl + "?tab=messages");
  await prov.waitForSelector("text=VODs uploaded");
  step("message delivered to provider");

  // Provider starts & completes
  await prov.goto(orderUrl);
  await prov.click("button:has-text('Start order')");
  await prov.waitForSelector("button:has-text('Submit completion')");
  await prov.click("button:has-text('Submit completion')");
  await prov.fill("#note", "Both VOD sessions delivered with written notes.");
  await prov.click("text=Submit for confirmation");
  await prov.waitForSelector("text=Waiting for the customer to confirm");
  step("provider submitted completion");

  // Customer confirms & reviews
  await cust.goto(orderUrl);
  await cust.click("button:has-text('Confirm completion')");
  await cust.click("text=Yes, confirm completion");
  await cust.waitForSelector("text=Leave a verified review");
  await cust.click("label:has(input[name=rating][value='5'])");
  await cust.fill("textarea[name=body]", "Super detailed review, fixed my entry timing.");
  await cust.click("text=Publish review");
  await cust.waitForSelector("text=Your verified review");
  await cust.screenshot({ path: SHOT("3-completed"), fullPage: true });
  step("completed and reviewed");

  // Provider earnings & payout
  await prov.goto(B + "/dashboard/payouts");
  await prov.click("button:has-text('Withdraw $64.40')");
  await prov.click("dialog[open] button:has-text('Withdraw')");
  await prov.waitForSelector("[role=status]:has-text('Payout sent')");
  step("provider payout of $64.40 ($70 - 8%)");
  await prov.goto(B + "/dashboard");
  await prov.screenshot({ path: SHOT("4-provider-overview"), fullPage: true });
  await cust.goto(B + "/dashboard/notifications");
  await cust.screenshot({ path: SHOT("5-notifications"), fullPage: true });
  await browser.close();
})().catch((e) => { console.error("E2E FAILED:", e.message); process.exit(1); });
