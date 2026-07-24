import { chromium, devices } from "playwright";

const BASE = "http://localhost:5173";
const PHONE = "7974161582";
const OTP = "1234";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream"],
  });

  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    // Grant notifications so FCM can resolve
    permissions: ["notifications"],
    serviceWorkers: "allow",
  });

  const page = await context.newPage();
  const consoleLogs = [];
  const networkFcm = [];

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
  });

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("fcm") || url.includes("verify-otp") || url.includes("request-otp")) {
      networkFcm.push({
        method: req.method(),
        url,
        postData: req.postData()?.slice(0, 300) || null,
      });
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("fcm-tokens") || url.includes("verify-otp")) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 400);
      } catch {}
      networkFcm.push({
        type: "response",
        status: res.status(),
        url,
        body,
      });
    }
  });

  // Clear any existing session
  await page.goto(`${BASE}/food/user/auth/login`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });

  // Diagnose browser capabilities before login
  const preflight = await page.evaluate(async () => {
    const out = {
      secureContext: window.isSecureContext,
      notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "N/A",
      hasServiceWorker: "serviceWorker" in navigator,
      hasPushManager: "PushManager" in window,
      hostname: location.hostname,
      swReg: null,
    };
    try {
      const reg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
      out.swReg = reg ? { scope: reg.scope, active: Boolean(reg.active) } : null;
    } catch (e) {
      out.swError = String(e?.message || e);
    }
    return out;
  });
  console.log("PREFLIGHT", JSON.stringify(preflight, null, 2));

  // Fill phone
  const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await phoneInput.waitFor({ timeout: 15000 });
  await phoneInput.fill(PHONE);

  // Submit for OTP
  const submitBtn = page.getByRole("button", { name: /continue|send|otp|login|get otp/i }).first();
  if (await submitBtn.count()) {
    await submitBtn.click();
  } else {
    await page.locator("form button[type='submit']").first().click();
  }

  // Wait for OTP page
  await page.waitForURL(/otp/i, { timeout: 20000 });
  await page.waitForTimeout(1000);

  // Fill OTP digits
  const otpInputs = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
  const count = await otpInputs.count();
  console.log("OTP input count", count);
  if (count >= 4) {
    for (let i = 0; i < 4; i++) {
      await otpInputs.nth(i).click();
      await otpInputs.nth(i).fill(OTP[i]);
      await page.waitForTimeout(150);
    }
  } else {
    // single input fallback
    await page.keyboard.type(OTP);
  }

  // Wait for login to complete / home
  try {
    await page.waitForURL(/\/food\/user(?!\/auth)/, { timeout: 25000 });
  } catch {
    console.log("Did not navigate to home, current URL:", page.url());
  }

  await page.waitForTimeout(5000);

  const postLogin = await page.evaluate(() => {
    return {
      url: location.href,
      notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "N/A",
      accessToken: Boolean(localStorage.getItem("user_accessToken")),
      cachedFcm: localStorage.getItem("fcm_web_registered_token_user")?.slice(0, 24) || null,
      roleUser: (() => {
        try {
          return JSON.parse(localStorage.getItem("user_user") || "{}")?.role || null;
        } catch {
          return null;
        }
      })(),
    };
  });

  console.log("POST_LOGIN", JSON.stringify(postLogin, null, 2));
  console.log("NETWORK", JSON.stringify(networkFcm, null, 2));
  console.log(
    "CONSOLE_PUSH",
    JSON.stringify(
      consoleLogs.filter((l) => /push|FCM|firebase|notification|vapid|service worker/i.test(l)).slice(-80),
      null,
      2,
    ),
  );
  console.log("CONSOLE_ERRORS", JSON.stringify(consoleLogs.filter((l) => l.startsWith("[error]")).slice(-40), null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT_FAIL", e);
  process.exit(1);
});
