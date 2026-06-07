import { test, expect } from '@playwright/test';

test.describe('Request Management', () => {
  test.beforeEach(async ({ page }) => {
    // Standard login as manager
    await page.goto('/login');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#password', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should view pending requests, and approve a request successfully', async ({ page }) => {
    await page.click('a[href="/requests"]');
    await expect(page).toHaveURL('/requests');

    // Check that pending requests are listed
    // The test data seeds a pending early_leave_approval request for Alice Tester: "Need to pick up kids"
    const aliceRequestRow = page.locator('tr:has-text("Alice Tester"):has-text("Need to pick up kids")');
    await expect(aliceRequestRow).toBeVisible();

    // Click the row to open review modal
    await aliceRequestRow.click();

    // Verify modal is open
    const modalTitle = page.locator('h3:has-text("Review Request")');
    await expect(modalTitle).toBeVisible();

    // Type a justification note (Required for approval)
    const justificationTextarea = page.locator('textarea[placeholder*="Explain why this request"]');
    await expect(justificationTextarea).toBeVisible();
    await justificationTextarea.fill('Family emergency, kids pickup approved.');

    // Click the initial Approve button inside the modal
    await page.click('button:has-text("Approve")');

    // Confirm view should display action summary
    const confirmHeading = page.locator('h3:has-text("Confirm Action Summary")');
    await expect(confirmHeading).toBeVisible();

    // Click Confirm & Submit
    await page.click('button:has-text("Confirm & Submit")');

    // Modal should close and the request should disappear from the "Pending Only" filter list
    await expect(modalTitle).not.toBeVisible();
    await expect(aliceRequestRow).not.toBeVisible();
  });
});
