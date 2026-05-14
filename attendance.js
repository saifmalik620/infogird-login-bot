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

    // Take screenshot to see what we're working with
    await page.screenshot({ path: "step1-login-page.png", fullPage: true });

    // ── Step 2: Enter credentials ───────────────────────────────
    // The login form has:
    //   - Email field with placeholder "Eg. abc@gmail.com"
    //   - Password field with placeholder "Eg. Passwords must be atleast 8 characters"
    //   - "Sign In" button

    // Try multiple selector strategies to find the email field
    const emailField = page.locator([
      'input[placeholder*="abc@gmail"]',
      'input[placeholder*="mail"]',
      'input[placeholder*="Email"]',
      'input[type="email"]',
      'input[type="text"]',
    ].join(", ")).first();

    await emailField.waitFor({ state: "visible", timeout: 15000 });
    await emailField.fill(EMAIL);
    console.log("✓ Email entered.");

    // Find the password field
    const passField = page.locator([
      'input[placeholder*="assword"]',
      'input[type="password"]',
    ].join(", ")).first();

    await passField.waitFor({ state: "visible", timeout: 15000 });
    await passField.fill(PASSWORD);
    console.log("✓ Password entered.");

    await page.screenshot({ path: "step2-credentials-filled.png", fullPage: true });

    // ── Step 3: Click Sign In button ────────────────────────────
    const signInBtn = page.locator([
      'button:has-text("Sign In")',
      'button:has-text("Login")',
      'button[type="submit"]',
      'input[type="submit"]',
    ].join(", ")).first();

    await signInBtn.click();
    console.log("→ Clicked Sign In...");

    // ── Step 4: Wait for dashboard ──────────────────────────────
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    console.log("✓ Dashboard loaded: " + page.url());

    // Let all elements fully render
    await page.waitForTimeout(5000);

    await page.screenshot({ path: "step3-dashboard.png", fullPage: true });

    // ── Step 5: Click In or Out button ──────────────────────────
    // From the dashboard screenshot, "In" (green) and "Out" (red)
    // are in the top-right corner of the header bar.

    if (action === "in") {
      console.log('→ Looking for the "In" button...');

      // Try multiple strategies to find the green "In" button
      const inBtn = page.locator([
        'a:has-text("In")',
        'button:has-text("In")',
        'span:has-text("In")',
        '[class*="green"]:has-text("In")',
        '[style*="green"]:has-text("In")',
      ].join(", ")).first();

      await inBtn.waitFor({ state: "visible", timeout: 15000 });
      await inBtn.click();
      console.log('✓ Clicked "In" button!');

    } else {
      console.log('→ Looking for the "Out" button...');

      // The "Out" button — use .last() since "Out" text may appear
      // after "In" in the DOM
      const outBtn = page.locator([
        'a:has-text("Out")',
        'button:has-text("Out")',
        'span:has-text("Out")',
        '[class*="red"]:has-text("Out")',
        '[style*="red"]:has-text("Out")',
      ].join(", ")).last();

      await outBtn.waitFor({ state: "visible", timeout: 15000 });
      await outBtn.click();
      console.log('✓ Clicked "Out" button!');
    }

    // Wait for any response
    await page.waitForTimeout(3000);

    // ── Step 6: Handle confirmation popup if any ────────────────
    try {
      const confirmBtn = page.locator([
        'button:has-text("OK")',
        'button:has-text("Confirm")',
        'button:has-text("Yes")',
        'button:has-text("Submit")',
      ].join(", ")).first();

      if (await confirmBtn.isVisible({ timeout: 5000 })) {
        await confirmBtn.click();
        console.log("✓ Confirmation dialog accepted.");
        await page.waitForTimeout(3000);
      }
    } catch {
      console.log("  (No confirmation dialog — that's fine.)");
    }

    // ── Step 7: Final screenshot as proof ───────────────────────
    await page.screenshot({ path: `after-${action}.png`, fullPage: true });
    console.log(`✓ Final screenshot saved.`);

    console.log(`\n[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] ✅ Attendance ${action.toUpperCase()} punched successfully!\n`);

  } catch (error) {
    await page.screenshot({ path: `error-${action}.png`, fullPage: true }).catch(() => {});
    console.error(`\n❌ Failed:`, error.message);

    // Dump the page HTML for debugging
    const html = await page.content().catch(() => "could not get HTML");
    console.error("\n── Page HTML (first 2000 chars) ──");
    console.error(html.substring(0, 2000));

    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
})();
