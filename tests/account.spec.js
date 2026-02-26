import { test, expect } from '@playwright/test';

test('Account dashboard username change', async ({ page }) => {
  await page.goto('http://localhost:8000/login.html');
  await page.fill('#svartId', 'test-svart-id');
  await page.fill('#password', 'testpassword');
  await page.click('button[type="submit"]');
  await page.goto('http://localhost:8000/account.html');
  await page.fill('#displayName', 'NewDisplayName');
  await page.click('button[type="submit"]');
  await expect(page.locator('#userName')).toHaveText('NewDisplayName');
  await expect(page.locator('#accountUsername')).toHaveText('NewDisplayName');
});

test('Navigation to SvartChat', async ({ page }) => {
  await page.goto('http://localhost:8000/SVART.html');
  await page.click('a[href="svartchat.html"]');
  await expect(page).toHaveURL(/.*svartchat.html/);
});
