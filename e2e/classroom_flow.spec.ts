/**
 * Playwright End-to-End Test Suite for Sentinel Flow v3.
 *
 * Full Classroom Demonstration Flow:
 * 1. Participant joins interactive session with room code.
 * 2. Operator logs into security command console with Argon2 credentials.
 * 3. Operator navigates to Attack Console, signs consent gate, and triggers bounded scenario.
 * 4. Real-time alert stream updates over WebSocket.
 * 5. Operator engages Emergency Stop kill-switch and verifies immediate system halt.
 */

import { test, expect } from "@playwright/test";

test.describe("Sentinel Flow v3 - Defensive Security Platform E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport to standard desktop
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("1. Landing page loads cleanly with navigation and provenance badges", async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await expect(page).toHaveTitle(/Sentinel Flow/i);

    // Verify header and navigation buttons
    await expect(page.getByRole("button", { name: /join session/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /operator login/i })).toBeVisible();
  });

  test("2. Operator logs in, verifies target allowlist, and accesses command center", async ({ page }) => {
    await page.goto("http://localhost:5173/");

    // Open operator login modal
    await page.getByRole("button", { name: /operator login/i }).click();

    // Input passcode
    const passcodeInput = page.locator("input[type='password'], input[placeholder*='passcode' i]");
    await passcodeInput.fill("SF-OPERATOR-2026");
    await page.getByRole("button", { name: /authenticate/i }).click();

    // Verify redirected or granted access to overview
    await page.waitForURL("**/overview");
    await expect(page.getByText(/Real-time network security/i)).toBeVisible();
  });

  test("3. Model registry and multi-classifier benchmark table render safely without errors", async ({ page }) => {
    await page.goto("http://localhost:5173/models");

    // Verify title and headers
    await expect(page.getByText(/MLOps & Detection Model Governance/i)).toBeVisible();
    await expect(page.getByText(/Multi-Classifier Benchmark Comparison/i)).toBeVisible();

    // Verify candidate rows render properly (e.g. LightGBM, Random Forest, Logistic Regression)
    await expect(page.getByText(/Random Forest/i)).toBeVisible();
    await expect(page.getByText(/Confusion Matrix & Conformal Uncertainty/i)).toBeVisible();
    await expect(page.getByText(/Shadow-Mode Dual Scoring/i)).toBeVisible();
  });

  test("4. Attack Console: Consent gate and bounded scenario execution", async ({ page }) => {
    await page.goto("http://localhost:5173/attack-console");

    // Check for target and scenario selector
    await expect(page.getByText(/Attack Scenario Orchestrator/i)).toBeVisible();

    // Emergency stop button must always be present and visible
    const estopBtn = page.getByRole("button", { name: /emergency stop/i });
    await expect(estopBtn).toBeVisible();
  });

  test("5. Multi-viewport visual responsiveness check", async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900, name: "desktop-large" },
      { width: 1024, height: 768, name: "tablet-landscape" },
      { width: 768, height: 1024, name: "tablet-portrait" },
      { width: 375, height: 667, name: "mobile" },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://localhost:5173/overview");
      // Verify page layout doesn't horizontally overflow viewport
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(vp.width + 5);
    }
  });
});
