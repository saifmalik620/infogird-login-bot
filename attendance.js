// attendance.js — Auto punch In/Out on InfoGird Expert Portal
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

// ── TIME WINDOW SAFETY CHECK ────────────────────────────────────
// Ensures the script ONLY punches within safe time windows (IST).
// If GitHub runs it outside these windows, it exits without punching.

function isWithinAllowedTime(punchType) {
  const now = new Date();
  // Convert to IST hours and minutes
  const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: false });
  const timeParts = istString.split(", ")[1].split(":");
  const hours = parseInt(timeParts[0]);
  const minutes = parseInt(timeParts[1]);
  const totalMinutes = hours * 60 + minutes;

  if (punchType === "in") {
    // Allowed: 8:00 AM to 12:30 PM IST (480 to 750 minutes)
    const start = 8 * 60;       // 8:00 AM = 480 min
    const end = 12 * 60 + 30;   // 12:30 PM = 750 min
    const allowed = totalMinutes >= start && totalMinutes <= end;
    console.log(`⏰ Current IST time: ${hours}:${String(minutes).padStart(2, "0")}`);
    console.log(`⏰ Punch IN allowed window: 8:00 AM – 12:30 PM IST`);
    console.log(`⏰ Within window: ${allowed ? "YES ✓" : "NO ✗"}`);
    return allowed;
  }

  if (punchType === "out") {
    // Allowed: 6:30 PM to 11:40 PM IST (1110 to 1420 minutes)
    const start = 18 * 60 + 30;  // 6:30 PM = 1110 min
    const end = 23 * 60 + 40;    // 11:40 PM = 1420 min
    const allowed = totalMinutes >= start && totalMinutes <= end;
    console.log(`⏰ Current IST time: ${hours}:${String(minutes).padStart(2, "0")}`);
    console.log(`⏰ Punch OUT allowed window: 6:30 PM – 11:40 PM IST`);
    console.log(`⏰ Within window: ${allowed ? "YES ✓" : "NO ✗"}`);
    return allowed;
  }

  return false;
}

// ── CHECK TIME BEFORE DOING ANYTHING ────────────────────────────
if (!isWithinAllowedTime(action)) {
  console.log(`\n🚫 SKIPPED: Current time is outside the allowed window for punch ${action.toUpperCase()}.`);
  console.log("   The script will NOT mark attendance. No action taken.");
  console.log("   This protects you from accidental late/wrong punches.\n");
  process.exit(0); // Exit successfully (not an error, just skipped)
}

// ── MAIN SCRIPT ─────────────────────────────────────────────────
(async () => {
  console.log(`\n[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] Starting attendance ${action.toUpperCase()} punch...\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
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

    const passField = page.locator([
      'input[placeholder*="assword"]',
      'input[type="password"]',
    ].join(", ")).first();

    await passField.waitFor({ state: "visible", timeout: 15000 });
    await passField.fill(PASSWORD);
    console.log("✓ Password entered.");

    // ── Step 3: Click Sign In button ────────────────────────────
    const signInBtn = page.locator([
      'button:has-text("Sign In")',
      'button:has-text("Login")',
      'button[type="submit"]',
    ].join(", ")).first();

    await signInBtn.click();
    console.log("→ Clicked Sign In...");

    // ── Step 4: Wait for dashboard ──────────────────────────────
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    console.log("✓ Dashboard loaded: " + page.url());

    // Let all Angular components render fully
    await page.waitForTimeout(7000);

    await page.screenshot({ path: "step3-dashboard.png", fullPage: true });

    // ── Step 5: Click In or Out button ──────────────────────────
    if (action === "in") {
      console.log('→ Looking for the "In" button...');

      const clicked = await page.evaluate(() => {
        const elements = document.querySelectorAll('a, button, span, div');
        for (const el of elements) {
          if (el.textContent.trim() === "In" && el.offsetWidth > 0 && el.offsetHeight > 0) {
            const rect = el.getBoundingClientRect();
            if (rect.x > 600 && rect.y < 150) {
              el.click();
              return { found: true, tag: el.tagName, classes: el.className, x: rect.x, y: rect.y };
            }
          }
        }
        return { found: false };
      });

      if (clicked.found) {
        console.log(`✓ Clicked "In" button! (${clicked.tag}, position: ${Math.round(clicked.x)},${Math.round(clicked.y)})`);
      } else {
        throw new Error('Could not find the "In" button in the top-right area.');
      }

    } else {
      console.log('→ Looking for the "Out" button...');

      const clicked = await page.evaluate(() => {
        const elements = document.querySelectorAll('a, button, span, div');
        for (const el of elements) {
          if (el.textContent.trim() === "Out" && el.offsetWidth > 0 && el.offsetHeight > 0) {
            const rect = el.getBoundingClientRect();
            if (rect.x > 600 && rect.y < 150) {
              el.click();
              return { found: true, tag: el.tagName, classes: el.className, x: rect.x, y: rect.y };
            }
          }
        }
        return { found: false };
      });

      if (clicked.found) {
        console.log(`✓ Clicked "Out" button! (${clicked.tag}, position: ${Math.round(clicked.x)},${Math.round(clicked.y)})`);
      } else {
        throw new Error('Could not find the "Out" button in the top-right area.');
      }
    }

    // Wait for confirmation popup to appear
    await page.waitForTimeout(3000);

    // ── Step 6: Handle confirmation popup ───────────────────────
    // Popup says "Are you sure to Punch In ?" with "Yes" and "No" buttons
    try {
      const yesBtn = page.locator('button:has-text("Yes")').first();

      if (await yesBtn.isVisible({ timeout: 5000 })) {
        await yesBtn.click();
        console.log('✓ Clicked "Yes" on confirmation popup.');
        await page.waitForTimeout(3000);
      }
    } catch {
      console.log("  (No confirmation dialog — that's fine.)");
    }

    // ── Step 7: Final screenshot ────────────────────────────────
    await page.screenshot({ path: `after-${action}.png`, fullPage: true });
    console.log(`✓ Final screenshot saved.`);

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
