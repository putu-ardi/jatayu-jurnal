import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

const admin = {
  schoolCode: requiredEnvironment("E2E_SCHOOL_CODE"),
  email: requiredEnvironment("E2E_ADMIN_EMAIL"),
  password: requiredEnvironment("E2E_ADMIN_PASSWORD"),
};
const member = {
  schoolCode: admin.schoolCode,
  email: requiredEnvironment("E2E_MEMBER_EMAIL"),
  password: requiredEnvironment("E2E_MEMBER_PASSWORD"),
};

test.describe.configure({ mode: "serial" });

let runtimeFailures: string[];

test.beforeEach(async ({ page }) => {
  runtimeFailures = collectRuntimeFailures(page);
});

test.afterEach(() => {
  expect(runtimeFailures, runtimeFailures.join("\n")).toEqual([]);
});

test("anonymous root resolves to the accessible login page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk ke E-JLS" })).toBeVisible();
  const schoolCodeInput = page.getByLabel("Kode sekolah");
  const emailInput = page.getByLabel("Email");
  const passwordInput = page.getByLabel("Kata sandi");
  const captchaInput = page.getByLabel("Hasil perhitungan");
  const refreshCaptchaButton = page.getByRole("button", { name: "Ganti soal" });
  const submitButton = page.getByRole("button", { name: "Masuk dengan akun fallback" });
  await expect(schoolCodeInput).toBeVisible();
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(captchaInput).toBeEnabled();
  await expectMinimumTarget(schoolCodeInput);
  await expectMinimumTarget(emailInput);
  await expectMinimumTarget(passwordInput);
  await expectMinimumTarget(captchaInput);
  await expectMinimumTarget(refreshCaptchaButton);
  await expectMinimumTarget(submitButton);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
  await expectNoAccessibilityViolations(page, "halaman login");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "E-JLS, ke formulir masuk" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(schoolCodeInput).toBeFocused();
  await expectFocusIndicator(schoolCodeInput);

  await schoolCodeInput.fill(admin.schoolCode);
  await emailInput.fill("absent@example.test");
  await passwordInput.fill("invalid-browser-evidence-password");
  await fillCaptcha(page);
  await submitButton.click();
  const loginError = page.getByRole("alert", { name: "Tidak dapat masuk" });
  await expect(loginError.getByText("Email atau kata sandi tidak valid.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("P-10 landing, pagination, keyboard, and mobile layout remain safe", async ({ page }) => {
  await login(page, admin);

  await expect(page).toHaveURL(/\/admin\/akses$/);
  await expect(page.getByRole("heading", { name: "Pengguna & Akses" })).toBeVisible();
  await expectNoAccessibilityViolations(page, "direktori P-10 desktop");

  await page.getByLabel("Baris per halaman").selectOption("10");
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(page).toHaveURL((url) =>
    url.pathname === "/admin/akses" && url.searchParams.get("pageSize") === "10",
  );
  await expect(page.locator(".user-list-card")).toHaveCount(10);

  await page.getByRole("link", { name: "Berikutnya" }).click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("page") === "2" && url.searchParams.get("pageSize") === "10",
  );
  await expect(page.locator(".user-list-card")).toHaveCount(10);

  await page.locator(".user-list-card").first().click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/pageSize=10/);
  await expect(page).toHaveURL(/user=[0-9a-f-]{36}/i);

  await page.goto("/admin/akses?pageSize=10");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Lewati ke konten utama" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expectFocusIndicator(skipLink);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/akses?pageSize=10");
  await expect(page.locator(".mobile-header")).toBeVisible();
  await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
  await expect(page.locator(".app-sidebar")).toBeHidden();
  await expect(page.getByLabel("Baris per halaman")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
  await expectNoAccessibilityViolations(page, "direktori P-10 mobile");
});

test("authenticated principal without P-10 stays on the neutral workspace", async ({ page }) => {
  await login(page, member);

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Modul untuk tugas Anda belum tersedia" }),
  ).toBeVisible();
  await expect(page.getByText("Sesi aktif")).toBeVisible();
  await expect(page.getByText(member.email)).toBeVisible();
  await expect(page.locator(".app-sidebar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pengguna & Akses" })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, "workspace netral");

  await page.getByRole("button", { name: "Keluar dari E-JLS" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

async function expectNoAccessibilityViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  const unresolvedContrast = results.incomplete
    .filter((result) => result.id === "color-contrast")
    .map((result) => result.nodes.map((node) => node.target.join(" ")))
    .flat();

  expect(violations, `${context} memiliki pelanggaran aksesibilitas.`).toEqual([]);
  expect(
    unresolvedContrast,
    `${context} memiliki contrast yang tidak dapat ditentukan otomatis.`,
  ).toEqual([]);
}

async function login(
  page: Page,
  credential: { schoolCode: string; email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("Kode sekolah").fill(credential.schoolCode);
  await page.getByLabel("Email").fill(credential.email);
  await page.getByLabel("Kata sandi").fill(credential.password);
  await fillCaptcha(page);
  await page.getByRole("button", { name: "Masuk dengan akun fallback" }).click();
}

async function fillCaptcha(page: Page) {
  const image = page.getByRole("img", {
    name: "Soal operasi matematika dengan latar bercoret.",
  });
  await expect(image).toBeVisible();
  const source = await image.getAttribute("src");
  expect(source).toMatch(/^\/api\/auth\/captcha\/[A-Za-z0-9_-]{43}\/image$/);
  const response = await page.request.get(source!);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
  const answer = await solveCaptchaPng(await response.body());
  await page.getByLabel("Hasil perhitungan").fill(answer);
}

async function solveCaptchaPng(image: Buffer) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(240);
  expect(info.height).toBe(88);
  const digitValues = [48, 78, 145].map((start) =>
    decodeSevenSegmentDigit(data, info.width, info.channels, start),
  );
  const operator = isDarkPixel(data, info.width, info.channels, 121, 35) ? "+" : "-";
  const left = digitValues[0] * 10 + digitValues[1];
  const right = digitValues[2];
  return String(operator === "+" ? left + right : left - right);
}

function decodeSevenSegmentDigit(
  data: Buffer,
  width: number,
  channels: number,
  start: number,
) {
  const segmentChecks = [
    [start + 11, 22],
    [start + 20, 32],
    [start + 20, 52],
    [start + 11, 62],
    [start + 2, 52],
    [start + 2, 32],
    [start + 11, 42],
  ];
  const active = segmentChecks.map(([x, y]) =>
    isDarkPixel(data, width, channels, x, y),
  );
  const patterns = [
    "1111110",
    "0110000",
    "1101101",
    "1111001",
    "0110011",
    "1011011",
    "1011111",
    "1110000",
    "1111111",
    "1111011",
  ];
  const pattern = active.map((value) => (value ? "1" : "0")).join("");
  const value = patterns.indexOf(pattern);
  expect(value, `Pola digit CAPTCHA tidak dikenali: ${pattern}`).toBeGreaterThanOrEqual(0);
  return value;
}

function isDarkPixel(
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
) {
  const offset = (y * width + x) * channels;
  return [0, 1, 2].every((channel) => (data[offset + channel] ?? 255) < 90);
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    if (errorText !== "net::ERR_ABORTED") {
      failures.push(`requestfailed: ${errorText}: ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`http ${response.status()}: ${response.url()}`);
  });
  return failures;
}

async function expectMinimumTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "Elemen interaktif harus memiliki bounding box.").not.toBeNull();
  expect(box!.width, "Lebar target interaktif minimal 44px.").toBeGreaterThanOrEqual(44);
  expect(box!.height, "Tinggi target interaktif minimal 44px.").toBeGreaterThanOrEqual(44);
}

async function expectFocusIndicator(locator: Locator) {
  const indicator = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  expect(
    indicator.outlineStyle !== "none" && indicator.outlineWidth >= 2 || indicator.boxShadow !== "none",
  ).toBe(true);
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} wajib diisi untuk browser evidence.`);
  return value;
}
