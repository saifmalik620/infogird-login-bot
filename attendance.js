// attendance.js — Auto punch In/Out on InfoGird Expert Portal
// Credentials come from GitHub Secrets (never hardcoded)
// Usage:  node attendance.js in
//         node attendance.js out

const { chromium } = require("playwright");

const EMAIL    = process.env.INFOGIRD_EMAIL;
const PASSWORD = process.env.INFOGIRD_PASS;
const action   = (process.argv[2] || "").toLowerCase();

if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing credentials. Set INFOGIRD_EMAIL and INFOGIRD_PASS.");
  process.exit(1);
}

if (action !== "in" && action !== "out") {
  console.error("❌ Specify 'in' or 'out'. Example: node attendance.js in");
  process.exit(1);
}

(async () => {
  console.log(`\n[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] Starting attendance ${action.toUpperCase()} punch...\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    timezoneId: "Asia/Kolkata",
  });

  const page = await context.newPage();

  try {
    // ── Step 1: Go to login page ────────────────────────────────
    console.log("→ Opening login page...");
    await page.goto("https://expert.infogird.com/login", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    console.log("✓ Login page loaded.");

    // ── Step 2: Enter credentials ───────────────────────────────
    await page.fill('input[type="email"], input[name="email"], input[id="email"]', EMAIL);
    console.log("✓ Email entered.");

    await page.fill('input[type="password"], input[name="password"], input[id="password"]', PASSWORD);
    console.log("✓ Password entered.");

    // ── Step 3: Click login button ──────────────────────────────
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    console.log("→ Logging in...");

    // ── Step 4: Wait for dashboard ──────────────────────────────
    await page.waitForURL("**/dashboard**", { timeout: 60000 });
    await page.waitForLoadState("networkidle");
    console.log("✓ Dashboard loaded.");

    // Let all elements render
    await page.waitForTimeout(5000);

    // Take a screenshot of the dashboard before clicking
    await page.screenshot({ path: `before-${action}.png`, fullPage: true });

    // ── Step 5: Click In or Out button ──────────────────────────
    if (action === "in") {
      console.log('→ Looking for the "In" button...');
      const inBtn = page.locator('a:has-text("In"), button:has-text("In"), span:has-text("In")').first();
      await inBtn.waitFor({ state: "visible", timeout: 15000 });
      await inBtn.click();
      console.log('✓ Clicked "In" button!');
    } else {
      console.log('→ Looking for the "Out" button...');
      const outBtn = page.locator('a:has-text("Out"), button:has-text("Out"), span:has-text("Out")').last();
      await outBtn.waitFor({ state: "visible", timeout: 15000 });
      await outBtn.click();
      console.log('✓ Clicked "Out" button!');
    }

    // Wait for any response
    await page.waitForTimeout(3000);

    // ── Step 6: Handle confirmation popup if any ────────────────
    try {
      const confirmBtn = page.locator(
        'button:has-text("OK"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Submit")'
      ).first();
      if (await confirmBtn.isVisible({ timeout: 5000 })) {
        await confirmBtn.click();
        console.log("✓ Confirmation dialog accepted.");
        await page.waitForTimeout(3000);
      }
    } catch {
      console.log("  (No confirmation dialog appeared — that's fine.)");
    }

    // ── Step 7: Screenshot as proof ─────────────────────────────
    await page.screenshot({ path: `after-${action}.png`, fullPage: true });
    console.log(`✓ Screenshots saved.`);

    console.log(`\n[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] ✅ Attendance ${action.toUpperCase()} punched successfully!\n`);

  } catch (error) {
    await page.screenshot({ path: `error-${action}.png`, fullPage: true }).catch(() => {});
    console.error(`\n❌ Failed:`, error.message);
    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
})();
