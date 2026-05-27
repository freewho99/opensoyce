import { test, expect } from '@playwright/test';

test.describe('OTS Pattern Library & Case Studies E2E Tests', () => {
  
  test('1. Navigates to Patterns directory and verifies layout & search', async ({ page }) => {
    await page.goto('http://localhost:3000/patterns');
    
    // Check page header
    const header = page.locator('h1');
    await expect(header).toContainText('OTS PATTERN DICTIONARY');
    
    // Check search box is visible
    const searchInput = page.locator('input[placeholder="Search patterns..."]');
    await expect(searchInput).toBeVisible();
    
    // Verify pack buttons are visible
    const packButtons = page.locator('button:has-text("npm Supply-Chain")');
    await expect(packButtons).toBeVisible();
    
    // Verify some pattern cards exist
    const cards = page.locator('article');
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Search for a specific pattern
    await searchInput.fill('Hidden Dependency Injection');
    await page.waitForTimeout(500); // Allow time for filter calculation
    
    // Check that we only see matching cards now
    const filteredCount = await cards.count();
    expect(filteredCount).toBe(1);
    
    const matchedTitle = cards.first().locator('h3');
    await expect(matchedTitle).toContainText('Hidden Dependency Injection');
  });

  test('2. Navigates to Pattern Detail page and inspects specifications', async ({ page }) => {
    await page.goto('http://localhost:3000/patterns/hidden-dependency-injection');
    
    // Verify title and pattern ID specifier
    const heading = page.locator('h1');
    await expect(heading).toContainText('Hidden Dependency Injection');
    
    const idSpec = page.locator('span:has-text("hidden-dependency-injection")');
    await expect(idSpec).toBeVisible();
    
    // Check Why it matters section
    const whyItMattersTitle = page.locator('h3:has-text("WHY THIS IS A SUPPLY-CHAIN RISK")');
    await expect(whyItMattersTitle).toBeVisible();
    
    // Check default policy block
    const policyBlock = page.locator('span:has-text("OTS GATE ACTION")');
    await expect(policyBlock).toBeVisible();
    
    // Check back link works
    const backLink = page.locator('a:has-text("Back to Pattern Library")');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL('http://localhost:3000/patterns');
  });

  test('3. Navigates to Incident Case Study page and verifies breakdown', async ({ page }) => {
    // Uses event-stream / flatmap-stream — a primary-source incident
    // that triggers Hidden Dependency Injection (the pattern this test
    // asserts is linked from the breakdown). Replaces the retired
    // axios-npm-compromise fixture.
    await page.goto('http://localhost:3000/incidents/event-stream-flatmap-stream');

    // Verify title
    const heading = page.locator('h1');
    await expect(heading).toContainText('event-stream / flatmap-stream Hidden Dependency Injection');

    // Verify technical breakdown is present
    const breakdownTitle = page.locator('h2:has-text("TECHNICAL BREAKDOWN")');
    await expect(breakdownTitle).toBeVisible();

    // Verify triggered patterns list
    const patternTitle = page.locator('h3:has-text("TRIGGERED OTS RISK PATTERNS")');
    await expect(patternTitle).toBeVisible();

    // Check link to pattern detail
    const patternLink = page.locator('a:has-text("Hidden Dependency Injection")').first();
    await expect(patternLink).toBeVisible();

    // Verify the source citation block is present
    const sourceLink = page.locator('a[href*="blog.npmjs.org"]').first();
    await expect(sourceLink).toBeVisible();

    // Verify "REPLAY WITH OTS" CTA appears for incidents with a replay
    const replayCta = page.locator('a:has-text("REPLAY WITH OTS")');
    await expect(replayCta).toBeVisible();
  });

  test('5. /proof/ots-replays renders live detector output for cited incidents', async ({ page }) => {
    await page.goto('http://localhost:3000/proof/ots-replays');

    // Header indicates the proof layer
    const heading = page.locator('h1');
    await expect(heading).toContainText('OTS Incident Replay Lab');

    // The 4 live-detector incidents are present
    await expect(page.locator('text=xz-utils Backdoor')).toBeVisible();
    await expect(page.locator('text=ua-parser-js npm Compromise')).toBeVisible();
    await expect(page.locator('text=event-stream / flatmap-stream')).toBeVisible();
    await expect(page.locator('text=Ledger Connect Kit')).toBeVisible();

    // The 2 catalog-mapping incidents are present
    await expect(page.locator('text=tj-actions/changed-files Compromise')).toBeVisible();
    await expect(page.locator('text=polyfill.io CDN Supply-Chain Compromise')).toBeVisible();

    // Detector Coverage Roadmap is shown
    await expect(page.locator('text=Detector Coverage Roadmap')).toBeVisible();
  });

  test('4. Navigates to Project Detail and checks risk patterns panel', async ({ page }) => {
    // Navigate to Axios project page where we simulated risk patterns
    await page.goto('http://localhost:3000/projects/axios/axios');
    
    // Wait for analysis loader to finish
    await page.waitForSelector('h1:has-text("axios/axios")');
    
    // Check that OTS Gate Intelligence panel is rendered
    const patternsPanel = page.locator('h3:has-text("Detected Risk Patterns")');
    await expect(patternsPanel).toBeVisible();
    
    // Verify Axios-simulated patterns (like hidden dependency injection) are shown
    const injectedPattern = page.locator('h4:has-text("Hidden Dependency Injection")');
    await expect(injectedPattern).toBeVisible();
    
    // Verify verdict display
    const verdict = page.locator('strong:has-text("BLOCK")');
    await expect(verdict).toBeVisible();
  });

});
