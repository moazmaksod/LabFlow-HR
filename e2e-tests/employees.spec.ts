import { test, expect } from '@playwright/test';

test.describe('Employee & Job Management', () => {
  test.beforeEach(async ({ page }) => {
    // Standard login as manager
    await page.goto('/login');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#password', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should create a new job, approve a pending employee with it, and edit their profile', async ({ page }) => {
    // 1. Create a new Job Role
    await page.click('a[href="/jobs"]');
    await expect(page).toHaveURL('/jobs');

    await page.click('button:has-text("Create New Role")');
    await page.fill('input[placeholder="e.g. Senior Developer"]', 'System Architect');
    await page.fill('input[type="number"] >> nth=0', '60'); // Hourly Rate
    await page.fill('input[type="number"] >> nth=1', '40'); // Weekly hours (usually default is 40)
    
    await page.click('button[type="submit"]:has-text("Create Job Role")');
    
    // Check it appears in the table
    await expect(page.locator('tbody')).toContainText('System Architect');

    // 2. Approve Pending Employee with that job role
    await page.click('a[href="/employees"]');
    await expect(page).toHaveURL('/employees');

    // Find Charlie Pending's row and approve
    const pendingRow = page.locator('tr:has-text("Charlie Pending")');
    await expect(pendingRow).toBeVisible();

    await pendingRow.locator('button:has-text("Approve")').click();

    // Select the new Job Role 'System Architect'
    const selectDropdown = pendingRow.locator('select');
    await selectDropdown.selectOption({ label: 'System Architect' });

    // Click Confirm to approve
    await pendingRow.locator('button:has-text("Confirm")').click();

    // Verify Charlie is approved and role is employee
    await expect(pendingRow.locator('td >> nth=3')).toContainText('employee'); // Role cell
    await expect(pendingRow.locator('td >> nth=5')).toContainText('System Architect'); // Job Title cell

    // 3. Edit approved employee details
    // Setup dialog listener to accept the "profile updated successfully" alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('updated successfully');
      await dialog.accept();
    });

    // Click on Charlie's row to open detail view overlay
    await pendingRow.click();
    
    const detailOverlay = page.locator('div.fixed h3:has-text("Charlie Pending")');
    await expect(detailOverlay).toBeVisible();

    // Change hourly rate to 65
    const hourlyRateInput = page.locator('input[name="hourly_rate"]');
    await hourlyRateInput.fill('65');

    // Click Save changes
    await page.click('button:has-text("Save Changes")');

    // Close the overlay
    await page.click('button:has-text("Save Changes") + button'); // Selects the X close button next to Save Changes

    await expect(detailOverlay).not.toBeVisible();
  });
});
