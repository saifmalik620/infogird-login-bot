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

    // ── Step 5: Find and dump the In/Out button area ────────────
    // First, let's find all elements containing exact text "In" or "Out"
    // that are visible and small (the buttons are tiny rounded rectangles)

    // Dump the top-right header area HTML for debugging
    const headerHTML = await page.evaluate(() => {
      // Get the header/navbar area
      const header = document.querySelector('header') ||
                     document.querySelector('nav') ||
                     document.querySelector('[class*="header"]') ||
                     document.querySelector('[class*="topbar"]') ||
                     document.querySelector('[class*="navbar"]');
      if (header) return header.outerHTML;

      // Fallback: get all elements with short text "In" or "Out"
      const elements = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const text = el.textContent.trim();
        if ((text === "In" || text === "Out") && el.offsetWidth > 0) {
          elements.push({
            tag: el.tagName,
            text: text,
            classes: el.className,
            id: el.id,
            html: el.outerHTML.substring(0, 300),
            rect: el.getBoundingClientRect(),
          });
        }
      }
      return JSON.stringify(elements, null, 2);
    });
    console.log("\n── Header / In-Out button info ──");
    console.log(headerHTML.substring(0, 5000));
    console.log("── End of header info ──\n");

    // ── Step 6: Click the In or Out button ──────────────────────
    // Strategy: find elements with EXACT text "In" or "Out" that are
    // visible and positioned in the top-right area of the page

    if (action === "in") {
      console.log('→ Looking for the "In" button...');

      // Use JavaScript to find and click the exact "In" button
      const clicked = await page.evaluate(() => {
        const elements = document.querySelectorAll('a, button, span, div');
        for (const el of elements) {
          // Must have exact text "In" (not "Inbox", "Information", etc.)
          if (el.textContent.trim() === "In" && el.offsetWidth > 0 && el.offsetHeight > 0) {
            const rect = el.getBoundingClientRect();
            // The In button is in the top-right area (x > 700, y < 150)
            if (rect.x > 600 && rect.y < 150) {
              el.click();
              return { found: true, tag: el.tagName, classes: el.className, x: rect.x, y: rect.y };
            }
          }
        }
        return { found: false };
      });

      if (clicked.found) {
        console.log(`✓ Clicked "In" button! (${clicked.tag}, class="${clicked.classes}", position: ${clicked.x},${clicked.y})`);
      } else {
        throw new Error('Could not find the "In" button in the top-right area. Check step3-dashboard.png and the header info above.');
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
        console.log(`✓ Clicked "Out" button! (${clicked.tag}, class="${clicked.classes}", position: ${clicked.x},${clicked.y})`);
      } else {
        throw new Error('Could not find the "Out" button in the top-right area. Check step3-dashboard.png and the header info above.');
      }
    }

    // Wait for any response / popup
    await page.waitForTimeout(3000);

    // ── Step 7: Handle confirmation popup if any ────────────────
    try {
      const confirmBtn = page.locator([
        'button:has-text("OK")',
        'button:has-text("Confirm")',
        'button:has-text("Yes")',
        'button:has-text("Submit")',
        '.swal2-confirm',
        '.modal-footer button',
      ].join(", ")).first();

      if (await confirmBtn.isVisible({ timeout: 5000 })) {
        await confirmBtn.click();
        console.log("✓ Confirmation dialog accepted.");
        await page.waitForTimeout(3000);
      }
    } catch {
      console.log("  (No confirmation dialog — that's fine.)");
    }

    // ── Step 8: Final screenshot ────────────────────────────────
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
