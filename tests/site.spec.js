import { test, expect } from '@playwright/test';

test('Signup and login flow', async ({ page }) => {
  await page.goto('http://localhost:8000/signup.html');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'testpassword123');
  await page.fill('#confirmPassword', 'testpassword123');
  await page.fill('#displayName', 'TestUser');
  await page.check('#terms');
  await page.click('button[type="submit"]');
  await expect(page.locator('#generatedKey')).toBeVisible();
});

test('Username change and persistence', async ({ page }) => {
  await page.goto('http://localhost:8000/login.html');
  await page.fill('#svartId', 'XXXX-XXXX-XXXX-XXXX'); // Use a valid key
  await page.fill('#password', 'testpassword123');
  await page.click('button[type="submit"]');
  await page.goto('http://localhost:8000/account-settings.html');
  await page.fill('#username', 'NewDisplayName');
  await page.click('button[type="submit"]');
  await expect(page.locator('#settingsUsername')).toHaveText('NewDisplayName');
});

test('Navigation and module access', async ({ page }) => {
  await page.goto('http://localhost:8000/SVART.html');
  await page.click('a[href="svartchat.html"]');
  await expect(page).toHaveURL(/.*svartchat.html/);
});
