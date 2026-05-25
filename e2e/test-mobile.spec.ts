import { test, expect } from '@playwright/test';

test('check sidebar variables on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('http://localhost:3000/');

  const aside = page.locator('aside');
  
  // 1. Initially, sidebar should be hidden on mobile
  await expect(aside).toBeHidden();
  
  // Check computed styles
  const debugInfoBefore = await aside.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      classes: el.className,
      display: style.display,
      visibility: style.visibility,
    };
  });
  console.log('Mobile sidebar closed style:', debugInfoBefore);
  expect(debugInfoBefore.display).toBe('none');

  // 2. Open the drawer using the menu button
  const menuBtn = page.locator('button[aria-label="Open menu"]');
  await expect(menuBtn).toBeVisible();
  await menuBtn.click();
  
  // 3. Sidebar should now be visible
  await expect(aside).toBeVisible();
  
  const debugInfoAfter = await aside.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      classes: el.className,
      display: style.display,
      visibility: style.visibility,
    };
  });
  console.log('Mobile sidebar open style:', debugInfoAfter);
  expect(debugInfoAfter.display).toBe('flex');

  // 4. Close the drawer using the close button
  const closeBtn = page.locator('button[aria-label="Close menu"]');
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  
  // 5. Sidebar should be hidden again
  await expect(aside).toBeHidden();
});
