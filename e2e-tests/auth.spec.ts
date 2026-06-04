import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to /login', async ({ page }) => {
    // Attempt to access the dashboard index
    await page.goto('/');
    
    // Expect redirection to login
    await expect(page).toHaveURL(/\/login/);
    
    // Title of the card or heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('should display error message on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in incorrect details
    await page.fill('#email', 'nonexistent@example.com');
    await page.fill('#password', 'WrongPassword123');

    // Click submit
    await page.click('button[type="submit"]');

    // Wait for the error banner to appear
    const errorBanner = page.locator('form div.text-red-500');
    await expect(errorBanner).toBeVisible();
  });

  test('should successfully log in as manager and then log out', async ({ page }) => {
    await page.goto('/login');

    // Seeded Manager credentials
    await page.fill('#email', 'jane@example.com');
    await page.fill('#password', 'Password123');

    // Click submit and wait for navigation
    await Promise.all([
      page.waitForURL('/'),
      page.click('button[type="submit"]'),
    ]);

    // Check that we are on the dashboard and welcome message is displayed
    await expect(page.locator('header h2')).toContainText('Welcome');
    
    // Now test logging out
    await page.click('button:has-text("Logout"), button:has-text("تسجيل الخروج")');

    // Verify redirected back to login page
    await expect(page).toHaveURL(/\/login/);
  });
});
