import { test, expect } from '@playwright/test';

test.describe('Navigation & Settings Toggles', () => {
  test.beforeEach(async ({ page }) => {
    // Standard login as manager
    await page.goto('/login');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#password', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should navigate to all main views via sidebar', async ({ page }) => {
    // Navigate to Employees list
    await page.click('a[href="/employees"]');
    await expect(page).toHaveURL('/employees');
    await expect(page.getByRole('heading', { name: 'Employee Management' })).toBeVisible();

    // Navigate to Job Roles
    await page.click('a[href="/jobs"]');
    await expect(page).toHaveURL('/jobs');
    await expect(page.getByRole('heading', { name: 'Job Roles & Templates' })).toBeVisible();

    // Navigate to Attendance Logs
    await page.click('a[href="/attendance"]');
    await expect(page).toHaveURL('/attendance');
    await expect(page.getByRole('heading', { name: 'Attendance Logs' })).toBeVisible();

    // Navigate to Requests
    await page.click('a[href="/requests"]');
    await expect(page).toHaveURL('/requests');
    await expect(page.getByRole('heading', { name: 'Requests & Approvals' })).toBeVisible();

    // Navigate to Payroll
    await page.click('a[href="/payroll"]');
    await expect(page).toHaveURL('/payroll');
    await expect(page.getByRole('heading', { name: 'Payroll Ledger' })).toBeVisible();

    // Navigate to Audit Logs
    await page.click('a[href="/audit"]');
    await expect(page).toHaveURL('/audit');
    await expect(page.getByRole('heading', { name: 'Global Audit Trail' })).toBeVisible();

    // Navigate to Settings (using the settings button in sidebar)
    await page.click('button:has-text("Settings"), button:has-text("الإعدادات")');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should toggle theme between light and dark mode', async ({ page }) => {
    const html = page.locator('html');

    // Toggle once
    const initialTheme = await html.getAttribute('class');
    await page.click('button[aria-label="Toggle Theme"]');
    
    const newTheme = await html.getAttribute('class');
    expect(newTheme).not.toEqual(initialTheme);
  });

  test('should switch language and update document direction', async ({ page }) => {
    const html = page.locator('html');

    // Locate the language switcher button in the header
    const langButton = page.locator('header button:has-text("عربي"), header button:has-text("English")');
    await expect(langButton).toBeVisible();

    const initialDir = await html.getAttribute('dir'); // e.g. ltr
    
    // Toggle language
    await langButton.click();
    
    // Check direction changed
    const toggledDir = await html.getAttribute('dir');
    expect(toggledDir).toBe(initialDir === 'ltr' ? 'rtl' : 'ltr');

    // Toggle language back
    await langButton.click();
    const finalDir = await html.getAttribute('dir');
    expect(finalDir).toBe(initialDir);
  });
});
