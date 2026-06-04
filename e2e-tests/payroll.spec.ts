import { test, expect } from '@playwright/test';

test.describe('Payroll Ledger', () => {
  test.beforeEach(async ({ page }) => {
    // Standard login as manager
    await page.goto('/login');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#password', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should load payroll table and view detailed employee ledger', async ({ page }) => {
    await page.click('a[href="/payroll"]');
    await expect(page).toHaveURL('/payroll');

    // Page title and estimated payroll display
    await expect(page.getByRole('heading', { name: 'Payroll Ledger' })).toBeVisible();
    await expect(page.getByText('Total Estimated Payroll')).toBeVisible();

    // Verify employee 'John Employee' is in the list
    const johnRow = page.locator('tr:has-text("John Employee")');
    await expect(johnRow).toBeVisible();

    // Verify net salary is rendered (e.g. should have some dollar amount)
    await expect(johnRow.locator('td >> nth=5')).toContainText('$');

    // Click "View Details" for John Employee
    await johnRow.locator('button:has-text("View Details")').click();

    // Details overlay should open
    const modal = page.locator('div.fixed');
    const detailHeader = modal.locator('h3:has-text("Employee Ledger Details")');
    await expect(detailHeader).toBeVisible();

    // Verify summary details are visible inside the modal
    await expect(modal.getByText('John Employee')).toBeVisible();
    await expect(modal.getByText('$35/hr')).toBeVisible();

    // Verify sections inside the details modal
    await expect(modal.locator('h4:has-text("Daily Breakdown logs")')).toBeVisible();
    await expect(modal.locator('h4:has-text("Processed Requests History")')).toBeVisible();

    // Close the details modal
    await page.click('button:has-text("Close")');
    await expect(detailHeader).not.toBeVisible();
  });
});
