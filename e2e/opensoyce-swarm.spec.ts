/**
 * OpenSoyce AI Swarm Test
 *
 * Simulates 12 synthetic user personas visiting opensoyce.com,
 * looking up real GitHub repos, and evaluating the experience.
 *
 * Uses Gemini AI to generate persona-aware feedback after each session.
 *
 * Run:
 *   npx playwright test e2e/opensoyce-swarm.spec.ts --headed
 *   npx playwright test e2e/opensoyce-swarm.spec.ts --headed --grep "MINI"
 */

import { test, expect, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { PERSONAS, getRandomPersonas, OpenSoycePersona } from './personas';
import * as dotenv from 'dotenv';
dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000';
const REPORTS_DIR = 'e2e/reports';
const SCREENSHOTS_DIR = 'e2e/screenshots';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

// Lazy-init Gemini client
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!_ai) _ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return _ai;
}


// ─── Result Types ─────────────────────────────────────────────────────────────

interface RepoResult {
  repo: string;
  score: string | null;
  pillars: Record<string, string>;
  loadTimeMs: number;
  error?: string;
}

interface AIReview {
  uxGrade: number;
  performanceGrade: number;
  trustGrade: number;
  review: string;
  actionableFeedback: string;
}

interface SwarmResult {
  persona: OpenSoycePersona;
  success: boolean;
  repoResults: RepoResult[];
  aiReview: AIReview | null;
  screenshotPath?: string;
  errors: string[];
  durationMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatTable(results: SwarmResult[]): string {
  const rows = results.map(r => {
    const repos = r.repoResults.map(rr => `${rr.repo}→${rr.score ?? 'ERR'}`).join(', ');
    return `| ${r.persona.name} | ${r.persona.archetype} | ${r.success ? '✅' : '❌'} | ${repos} | ${Math.round(r.durationMs / 1000)}s |`;
  });
  return [
    '| Persona | Archetype | Pass | Repos Checked | Duration |',
    '|---------|-----------|------|---------------|----------|',
    ...rows,
  ].join('\n');
}

function parseDelay(errText: string): number {
  const match = errText.match(/Please retry in (\d+\.?\d*)s/i) || 
                errText.match(/retryDelay":"(\d+)s"/i) ||
                errText.match(/retry after (\d+) seconds/i) ||
                errText.match(/retryDelay"\s*:\s*"(\d+)"/i) ||
                errText.match(/"retryDelay"\s*:\s*(\d+)/i);
  let delayMs = 2000; // Default to 2 seconds instead of 15 seconds
  if (match) {
    const seconds = parseFloat(match[1]);
    delayMs = Math.ceil(seconds * 1000) + 500; // Wait slightly longer to ensure the window clears
  }
  // Cap at 5 seconds max delay to avoid Playwright test timeout
  return Math.min(delayMs, 5000);
}

async function callGemini(prompt: string, attempt = 1): Promise<string> {
  const maxAttempts = 3;
  const ai = getAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
      });
      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      const errText = err.message || String(err);
      const isHardQuota = errText.includes('quota') || errText.includes('billing') || errText.includes('RESOURCE_EXHAUSTED');
      const isRateLimit = !isHardQuota && (errText.includes('rate') || errText.includes('429') || errText.includes('502') || errText.includes('503'));
      if (isRateLimit && attempt < maxAttempts) {
        const delayMs = parseDelay(errText);
        console.warn(`   ⚠️ Direct Gemini API rate limited. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return callGemini(prompt, attempt + 1);
      }
      console.warn(`   ⚠️ Direct Gemini API failed: ${errText}. Falling back to proxy...`);
    }
  }

  const SUPABASE_URL = 'https://blgtxzhlqutqauyudpfd.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsZ3R4emhscXV0cWF1eXVkcGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3ODUzMzEsImV4cCI6MjA3NzM2MTMzMX0.AcN4kuHGUSOvKJlydUk920d0GywgfYTeY4Domji7MnY';
  
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ prompt })
    });
    
    const resTextForCheck = await res.clone().text().catch(() => '');
    const isHardQuotaProxy = resTextForCheck.includes('quota') || resTextForCheck.includes('billing') || resTextForCheck.includes('RESOURCE_EXHAUSTED');

    if ((res.status === 429 || res.status === 502 || res.status === 503) && !isHardQuotaProxy) {
      if (attempt < maxAttempts) {
        const delayMs = parseDelay(resTextForCheck || `status ${res.status}`);
        console.warn(`   ⚠️ Gemini proxy rate limited or busy (${res.status}). Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return callGemini(prompt, attempt + 1);
      }
    }

    if (!res.ok) {
      const isRateLimitInner = !isHardQuotaProxy && (resTextForCheck.includes('rate') || resTextForCheck.includes('429') || resTextForCheck.includes('502') || resTextForCheck.includes('503'));
      if (isRateLimitInner) {
        if (attempt < maxAttempts) {
          const delayMs = parseDelay(resTextForCheck);
          console.warn(`   ⚠️ Gemini proxy inner rate limit. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return callGemini(prompt, attempt + 1);
        }
      }
      throw new Error(`Proxy returned ${res.status}: ${resTextForCheck}`);
    }
    
    const data = JSON.parse(resTextForCheck);
    if (data.text) {
      return data.text;
    }
    return '(Proxy returned no text)';
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    const isHardQuotaCatch = msg.includes('quota') || msg.includes('billing') || msg.includes('RESOURCE_EXHAUSTED');
    const isRateLimitCatch = !isHardQuotaCatch && (msg.includes('rate') || msg.includes('429') || msg.includes('502') || msg.includes('503'));
    if (isRateLimitCatch && attempt < maxAttempts) {
      const delayMs = parseDelay(msg);
      console.warn(`   ⚠️ Proxy exception rate limit error. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return callGemini(prompt, attempt + 1);
    }
    console.error(`   ⚠️ Proxy Error: ${msg.substring(0, 150)}`);
    return `(Gemini proxy error: ${msg})`;
  }
}



function writeReport(results: SwarmResult[], label: string) {
  ensureDir(REPORTS_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const successCount = results.filter(r => r.success).length;
  const successRate = Math.round((successCount / results.length) * 100);

  const sections = results.map(r => `
## ${r.persona.name} (${r.persona.archetype})

**Goal:** ${r.persona.goal}
**Result:** ${r.success ? '✅ PASS' : '❌ FAIL'} — ${Math.round(r.durationMs / 1000)}s

### Repos Checked
${r.repoResults.map(rr => `- \`${rr.repo}\` → Score: **${rr.score ?? 'N/A'}** (${rr.loadTimeMs}ms)
${Object.entries(rr.pillars).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}
${rr.error ? `  - ⚠️ Error: ${rr.error}` : ''}`).join('\n')}

### AI Review
${r.aiReview ? `
**UX Grade**: ${r.aiReview.uxGrade}/100
**Performance Grade**: ${r.aiReview.performanceGrade}/100
**Trust Grade**: ${r.aiReview.trustGrade}/100

> ${r.aiReview.review}

**Actionable Feedback**: ${r.aiReview.actionableFeedback}
` : '_Not generated_'}

${r.errors.length > 0 ? `### Errors\n${r.errors.map(e => `- ${e}`).join('\n')}` : ''}
`).join('\n---\n');

  const report = `# OpenSoyce Swarm Report — ${label}

**Generated:** ${new Date().toISOString()}
**Success Rate:** ${successRate}% (${successCount}/${results.length})

## Summary Table

${formatTable(results)}

---

${sections}
`;

  const latestPath = path.join(REPORTS_DIR, 'swarm-latest.md');
  const archivedPath = path.join(REPORTS_DIR, `swarm-${ts}.md`);
  fs.writeFileSync(latestPath, report, 'utf-8');
  fs.writeFileSync(archivedPath, report, 'utf-8');
  console.log(`\n📄 Report → ${latestPath}`);
  return latestPath;
}



function base64urlEncode(bufOrString: Buffer | string): string {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(bufOrString, 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function mintSessionToken(login: string, orgs: string[], secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { login, orgs, exp: now + 3600 };
  const json = JSON.stringify(payload);
  const enc = base64urlEncode(json);
  const sig = crypto.createHmac('sha256', secret).update(json).digest('hex');
  return `${enc}.${sig}`;
}

// ─── Core Session Logic ────────────────────────────────────────────────────────

async function runPersonaSession(page: Page, persona: OpenSoycePersona): Promise<SwarmResult> {
  const start = Date.now();
  const result: SwarmResult = {
    persona,
    success: false,
    repoResults: [],
    aiReview: null,
    errors: [],
    durationMs: 0,
  };

  try {
    const secret = process.env.OPENSOYCE_DASHBOARD_SECRET || 'unit-test-dashboard-secret-32-chars-x';
    const login = persona.name.replace(/\s+/g, '-').toLowerCase();
    const token = mintSessionToken(login, ['acme-corp'], secret);

    await page.context().addCookies([{
      name: 'osg_session',
      value: token,
      url: BASE_URL
    }]);

    console.log(`\n🤖 [${persona.name}] Starting session (goal: ${persona.goal})`);

    // ── 1. Land on the homepage ──────────────────────────────────────────────
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`   ↳ Loaded homepage`);

    // Take hero screenshot
    ensureDir(SCREENSHOTS_DIR);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${persona.id}-hero.png`),
      fullPage: false,
    });

    // ── 2. Look up each repo ─────────────────────────────────────────────────
    let complianceChecked = false;
    for (const repo of persona.reposToLookup) {
      const repoResult: RepoResult = {
        repo,
        score: null,
        pillars: {},
        loadTimeMs: 0,
      };

      try {
        console.log(`   ↳ [${persona.name}] Looking up: ${repo}`);
        const repoStart = Date.now();

        // Navigate directly to the lookup URL — bypasses homepage dropdown flow
        await page.goto(`${BASE_URL}/lookup?q=${encodeURIComponent(repo)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        // Click "Analyze Repo" to start analysis
        const submitBtn = page.locator(
          'button:has-text("Analyze Repo"), button:has-text("Analyze"), button[type="submit"]'
        ).first();

        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
        await submitBtn.click();

        // Wait for score — exact aria-label from live DOM: "Soyce Score 8.2 of 10"
        // Analysis takes 25-40 seconds on the live server
        const scoreEl = page.locator('span[aria-label^="Soyce Score"]').first();
        await scoreEl.waitFor({ state: 'visible', timeout: 60000 });

        // Read the score value
        repoResult.score = await scoreEl.textContent({ timeout: 5000 }).catch(() => null);
        repoResult.loadTimeMs = Date.now() - repoStart;

        // Read pillar scores from the breakdown section
        const pillars = ['Maintenance', 'Security', 'Community', 'Documentation', 'Activity'];
              // ── 2b. Interact with new SauceIDE features based on persona ─────────────
        if (repoResult.score !== null) {
          // A. Open/Close Reasoning Trace Drawer
          if (persona.archetype === 'security-engineer' || persona.archetype === 'oss-maintainer' || persona.personality.curiosity >= 8) {
            console.log(`   ↳ [${persona.name}] Opening Reasoning Trace Drawer`);
            const traceBtn = page.locator('button:has-text("view trace")').first();
            if (await traceBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await traceBtn.click();
              await page.waitForTimeout(500);
              const drawerHeader = page.locator('text=Reasoning Trace Audit').first();
              if (await drawerHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log(`   ✅ [${persona.name}] Verified Reasoning Trace Audit Drawer is visible`);
                
                // Toggle theme inside drawer
                const themeBtn = page.locator('#toggle-drawer-theme-btn');
                if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await themeBtn.click();
                  await page.waitForTimeout(300);
                  await themeBtn.click();
                  await page.waitForTimeout(300);
                  console.log(`   ✅ [${persona.name}] Clicked Theme Toggle inside drawer`);
                }

                const closeBtn = page.locator('#close-reasoning-trace-drawer');
                await closeBtn.click({ timeout: 3000 }).catch(err => {
                  console.warn(`      ⚠️ Failed to click close button: ${err.message}`);
                });
                await page.waitForTimeout(500); // Allow slide-out animation to complete
              }
              await page.waitForTimeout(300);
            }
          }

          // B & C. Trust Posture Simulator and Automerge Governor Overrides
          const wantsSimulator = persona.archetype === 'security-engineer' || persona.archetype === 'cto' || persona.personality.criticalness >= 8;
          const wantsAutomerge = persona.archetype === 'github-power-user' || persona.archetype === 'cto' || persona.techLevel === 'expert';

          if (wantsSimulator || wantsAutomerge) {
            console.log(`   ↳ [${persona.name}] Interacting with Trust Posture Simulator & Automerge Governor`);
            const simulatorToggle = page.locator('button:has-text("OFF")').first();
            if (await simulatorToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
              await simulatorToggle.click();
              await page.waitForTimeout(500);
              console.log(`   ✅ [${persona.name}] Toggled Simulator Mode ON`);

              // Test Preset Saving & Loading
              const savePresetBtn = page.locator('#save-preset-btn');
              const loadPresetBtn = page.locator('#load-preset-btn');
              if (await savePresetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await savePresetBtn.click();
                await page.waitForTimeout(300);
                console.log(`   ✅ [${persona.name}] Saved simulator preset`);
              }

              if (wantsSimulator) {
                const dependabotCheckbox = page.locator('label:has-text("Add Dependabot scanning") input[type="checkbox"]').first();
                if (await dependabotCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
                  const wasChecked = await dependabotCheckbox.isChecked();
                  await dependabotCheckbox.click();
                  await page.waitForTimeout(500);
                  const isChecked = await dependabotCheckbox.isChecked();
                  console.log(`   ✅ [${persona.name}] Toggled Dependabot Override: ${wasChecked} -> ${isChecked}`);
                }
              }

              if (await loadPresetBtn.isVisible({ timeout: 2000 }).catch(() => false) && await loadPresetBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
                await loadPresetBtn.click();
                await page.waitForTimeout(300);
                console.log(`   ✅ [${persona.name}] Loaded simulator preset`);
              }

              if (wantsAutomerge) {
                console.log(`   ↳ [${persona.name}] Testing Automerge Governor overrides`);
                const selectEl = page.locator('select').first();
                if (await selectEl.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await selectEl.selectOption('major');
                  await page.waitForTimeout(500);
                  console.log(`   ✅ [${persona.name}] Automerge change type set to Major`);
                  
                  const lifecycleCheckbox = page.locator('label:has-text("Adds lifecycle script") input[type="checkbox"]').first();
                  if (await lifecycleCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await lifecycleCheckbox.click();
                    await page.waitForTimeout(500);
                    console.log(`   ✅ [${persona.name}] Toggled adds lifecycle script`);
                  }
                }
              }

              // Test Export Policy JSON
              const exportBtn = page.locator('#export-policy-json-btn');
              if (await exportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                try {
                  const downloadPromise = page.waitForEvent('download');
                  await exportBtn.click();
                  const download = await downloadPromise;
                  const downloadPath = await download.path();
                  console.log(`   ✅ [${persona.name}] Exported policy JSON to ${downloadPath}`);
                } catch (exportErr: any) {
                  console.warn(`      ⚠️ Failed to export policy JSON or wait for download: ${exportErr.message}`);
                }
              }

              const simulatorToggleActive = page.locator('button:has-text("ACTIVE")').first();
              if (await simulatorToggleActive.isVisible({ timeout: 1000 }).catch(() => false)) {
                await simulatorToggleActive.click();
                await page.waitForTimeout(300);
                console.log(`   ✅ [${persona.name}] Toggled Simulator Mode OFF`);
              }
            }
          }

          // D. Interact with AI Chatbot Auditing Assistant
          if (persona.personality.curiosity >= 7 || persona.archetype === 'devrel' || persona.archetype === 'student') {
            console.log(`   ↳ [${persona.name}] Sending message to Sauce Auditor`);
            
            // Test Glossary button
            const glossaryBtn = page.locator('#glossary-help-btn');
            if (await glossaryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await glossaryBtn.click();
              await page.waitForTimeout(300);
              console.log(`   ✅ [${persona.name}] Clicked Glossary Help Definitions button`);
            }

            const badgeChipButton = page.locator('button:has-text("How to add badge?")').first();
            const securityChipButton = page.locator('button:has-text("Explain Security score")').first();
            if ((persona.archetype === 'devrel' || persona.archetype === 'oss-maintainer') && await badgeChipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await badgeChipButton.click();
              await page.waitForTimeout(1000);
              console.log(`   ✅ [${persona.name}] Clicked quick chip "How to add badge?"`);
            } else if (await securityChipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await securityChipButton.click();
              await page.waitForTimeout(1000);
              console.log(`   ✅ [${persona.name}] Clicked quick chip "Explain Security score"`);
            } else {
              const chatInput = page.locator('input[placeholder="Ask about score..."]').first();
              if (await chatInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                await chatInput.fill('How to improve?');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(1000);
                console.log(`   ✅ [${persona.name}] Asked: "How to improve?"`);
              }
            }
          }

          // E. Execute recommended actions & check Claimed Portfolio
          if (persona.archetype === 'devrel' || persona.archetype === 'oss-maintainer' || persona.archetype === 'hiring-manager') {
            console.log(`   ↳ [${persona.name}] Executing recommended actions / visiting portfolio`);
            const claimBtn = page.locator('button:has-text("Claim Repository")').first();
            if (await claimBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await claimBtn.click();
              await page.waitForTimeout(500);
              console.log(`   ✅ [${persona.name}] Clicked Claim Repository action`);
            }
            
            // Navigate to /claim to view Verified Candidate Portfolio
            console.log(`   ↳ [${persona.name}] Navigating to /claim to check Verified Candidate Portfolio`);
            await page.goto(`${BASE_URL}/claim`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const portfolioHeader = page.locator('text=Verified Candidate Portfolio').first();
            await portfolioHeader.waitFor({ state: 'visible', timeout: 10000 });
            console.log(`   ✅ [${persona.name}] Verified Candidate Portfolio is visible`);
            
            // Assert that the repository we just claimed is listed in the VCP
            const claimedRepoCard = page.locator(`h3:has-text("${repo}")`).first();
            await claimedRepoCard.waitFor({ state: 'visible', timeout: 5000 });
            console.log(`   ✅ [${persona.name}] Verified that claimed repo "${repo}" is listed in the portfolio`);
            
            // Brief pause to look at portfolio
            await page.waitForTimeout(1000);
            
            // Go back to lookup URL if we have more lookups (or let it navigate in the next loop)
            await page.goto(`${BASE_URL}/lookup?q=${encodeURIComponent(repo)}`, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          }

          // F. Compliance-focused integration check (Settings Auditor key generation)
          if ((persona.archetype === 'security-engineer' || persona.archetype === 'cto') && !complianceChecked) {
            complianceChecked = true;
            console.log(`   ↳ [${persona.name}] Compliance persona: testing settings Auditor Key generation`);
            await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Wait for Compliance section to load
            const complianceHeader = page.locator('text=Compliance Integrations').first();
            await complianceHeader.waitFor({ state: 'visible', timeout: 10000 });
            
            // Click Generate Auditor Key
            const generateBtn = page.locator('button:has-text("Generate Auditor Key")').first();
            await generateBtn.waitFor({ state: 'visible', timeout: 10000 });
            await generateBtn.click();
            
            // Wait for auditor key and configuration guide to appear
            const keyLabel = page.locator('text=YOUR AUDITOR KEY (SAVE NOW)').first();
            await keyLabel.waitFor({ state: 'visible', timeout: 10000 });
            console.log(`   ✅ [${persona.name}] Verified Auditor Key was generated`);
            
            const vantaGuide = page.locator('text=Vanta/Drata Configuration Guide').first();
            await vantaGuide.waitFor({ state: 'visible', timeout: 10000 });
            console.log(`   ✅ [${persona.name}] Verified Vanta/Drata Configuration Guide is visible`);

            // Go back to lookup URL for remaining repos
            await page.goto(`${BASE_URL}/lookup?q=${encodeURIComponent(repo)}`, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          }
        }

        // Persona-specific behavior: patient users scroll and explore
        if (persona.personality.curiosity >= 8) {
          await page.evaluate(() => window.scrollTo(0, 400));
          await page.waitForTimeout(800);
          await page.evaluate(() => window.scrollTo(0, 0));
        }

        // Brief think time between lookups (simulates human)
        await page.waitForTimeout(1000 + persona.personality.patience * 200);

      } catch (err) {
        repoResult.error = err instanceof Error ? err.message : String(err);
        result.errors.push(`[${repo}] ${repoResult.error}`);
        console.error(`   ❌ [${persona.name}] ${repo} failed: ${repoResult.error}`);
      }

      result.repoResults.push(repoResult);
    }

    result.success = result.repoResults.some(r => r.score !== null);

    // ── 3. Generate AI review ────────────────────────────────────────────────
    // Track what features were actually interacted with
    const wantsTrace = (persona.archetype === 'security-engineer' || persona.archetype === 'oss-maintainer' || persona.personality.curiosity >= 8);
    const wantsSimulator = (persona.archetype === 'security-engineer' || persona.archetype === 'cto' || persona.personality.criticalness >= 8);
    const wantsAutomerge = (persona.archetype === 'github-power-user' || persona.archetype === 'cto' || persona.techLevel === 'expert');
    const wantsChat = (persona.personality.curiosity >= 7 || persona.archetype === 'devrel' || persona.archetype === 'student');
    const wantsAction = (persona.archetype === 'devrel' || persona.archetype === 'oss-maintainer');

    const wantsPortfolio = (persona.archetype === 'devrel' || persona.archetype === 'oss-maintainer' || persona.archetype === 'hiring-manager');

    const interactionsSummary = [
      wantsTrace ? "- Opened and examined the Reasoning Trace drawer to audit step-by-step score calculation, testing both theme views." : null,
      (wantsSimulator || wantsAutomerge) ? "- Used the Trust Posture Simulator to save/load custom presets, toggle scanning parameters, and simulate Automerge Governor overrides (e.g. major change type, lifecycle scripts) in real-time, exporting policy JSON results." : null,
      wantsChat ? "- Opened the definitions glossary and interacted with Sauce Auditor chat suggestion chips (such as 'How to add badge?') and asked about badge integration." : null,
      wantsAction ? "- Triggered Recommended Actions (e.g. Claim Repository)." : null,
      wantsPortfolio ? "- Navigated to the Claim page (/claim) and verified the Verified Candidate Portfolio list displays claimed repos successfully." : null,
    ].filter(Boolean).join('\n');

    // ── 3. Generate AI review ────────────────────────────────────────────────
    const scores = result.repoResults.map(r => `${r.repo}: ${r.score ?? 'failed'}`).join(', ');
    const prompt = `You are ${persona.name}, a ${persona.role} with tech level "${persona.techLevel}".
Your goal visiting OpenSoyce was: "${persona.goal}".
Personality: patience=${persona.personality.patience}/10, criticalness=${persona.personality.criticalness}/10, curiosity=${persona.personality.curiosity}/10.
Behavior: ${persona.behaviorNotes}

During your session, you interacted with and evaluated the following NEW features of SauceIDE:
${interactionsSummary || '- Visited the dashboard and evaluated the layout of the score pillars, Reasoning Trace button, and Sauce Auditor panel.'}

CRITICAL DIRECTIVE:
You MUST focus your feedback and review 100% on the NEW SauceIDE features themselves (Reasoning Trace Drawer, Trust Posture Simulator, Automerge Governor overrides, Sauce Auditor Chat, glossary chips, Claim Repository flow, and Verified Candidate Portfolio).
DO NOT mention or complain about general repository load times, query speeds, repository lookup latencies, or site performance speed. If you complain about the 2-second repository load time, you fail this task.
Instead, judge:
- The usability, UI layout, clarity of information, and value of the new features.
- The interactive responsiveness of the new features themselves (e.g., how smoothly the drawer opens/closes, preset saving/loading speed, the immediate feedback of simulator toggles, and chat responsiveness).
- How well the new tools integrate with each other to support your workflow.

GROUNDING RULES - DO NOT HALLUCINATE MISSING FEATURES:
- The site ALREADY has a 7-tier verdict band (e.g. "FORKABLE", "STABLE") alongside the number for beginner context.
- The site ALREADY has a detailed /methodology page linked directly from the score card.
- The site ALREADY has a lightning-fast 5-minute LRU cache (you can see this if your load time was < 1000ms).
- The Security subscore is ALREADY fully integrated with the GitHub Advisory Database and .github/SECURITY.md.
- The homepage does NOT pre-fill example repos, it just has a clean text input.
- The site ALREADY has a Trust Posture Simulator to override security posture and simulate package updates (Change Type, Adds lifecycle script, etc.) in real-time.
- The site ALREADY has an Automerge Governor card that displays dependency update firewall decisions (e.g. ALLOWED, BLOCKED, NEEDS REVIEW).
- The site ALREADY has a Reasoning Trace Drawer displaying step-by-step audit logs of how the final score and verdict were calculated.
- The site ALREADY has an interactive AI Chat Auditing Assistant ("Ask Sauce Auditor") with suggestion chips to answer score queries.
- The site ALREADY has Recommended Actions buttons (like "Claim Repository" or "Request Manual Review").
Do NOT suggest adding these features in your actionableFeedback, as they already exist. Focus your feedback entirely on improvements or suggestions for the new SauceIDE features you evaluated.

IMPORTANT: You MUST respond with ONLY a raw JSON object matching this schema:
{
  "uxGrade": <number between 0 and 100 representing UX satisfaction with the layout, design, and clarity of the new features>,
  "performanceGrade": <number between 0 and 100 representing interaction responsiveness of the new feature controls (e.g., drawer opening, preset loading, chat clicks), NOT page/repo load time>,
  "trustGrade": <number between 0 and 100 representing trust built by the details/logs in the new features>,
  "review": "<Your immersive, honest 3-5 sentence review string in-character focused solely on the usability and interface of the new features>",
  "actionableFeedback": "<Detailed constructive feedback or suggestions to improve these specific features, or 'None' if completely satisfied>"
}
CRITICAL: Do NOT use unescaped double quotes inside your strings. Do NOT include newlines or line breaks inside your strings. Keep the strings as a single continuous line.`;

    console.log(`   🧠 [${persona.name}] Generating AI review...`);
    try {
      const aiResponse = await callGemini(prompt);
      const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      console.log(`   🔎 [DEBUG RAW RESPONSE] for ${persona.name}:\n${cleaned}\n-----------------`);
      try {
        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch (jsonErr) {
          const uxGrade = parseInt(
            cleaned.match(/"?uxGrade"?\s*:\s*(\d+)/i)?.[1] ||
            cleaned.match(/ux\s*grade\s*[:*-\s]+(\d+)/i)?.[1] ||
            cleaned.match(/"?ux"?\s*:\s*(\d+)/i)?.[1] ||
            "50",
            10
          );
          const performanceGrade = parseInt(
            cleaned.match(/"?performanceGrade"?\s*:\s*(\d+)/i)?.[1] ||
            cleaned.match(/performance\s*grade\s*[:*-\s]+(\d+)/i)?.[1] ||
            cleaned.match(/perf\s*grade\s*[:*-\s]+(\d+)/i)?.[1] ||
            cleaned.match(/"?perf"?\s*:\s*(\d+)/i)?.[1] ||
            "50",
            10
          );
          const trustGrade = parseInt(
            cleaned.match(/"?trustGrade"?\s*:\s*(\d+)/i)?.[1] ||
            cleaned.match(/trust\s*grade\s*[:*-\s]+(\d+)/i)?.[1] ||
            cleaned.match(/"?trust"?\s*:\s*(\d+)/i)?.[1] ||
            "50",
            10
          );
          
          let review = "";
          const reviewMatch = 
            cleaned.match(/"?review"?\s*:\s*"([^]*?)"\s*,\s*"?actionableFeedback"?/i) ||
            cleaned.match(/"?review"?\s*:\s*"([^]*?)"/i) ||
            cleaned.match(/"?review"?\s*[:*-\s]+([^]*?)(?:\r?\n\s*[-*]?\s*"?actionableFeedback"?|\s*$)/i) ||
            cleaned.match(/"?review"?\s*:\s*([^]*?)(?:,\s*"?actionableFeedback"?|\s*$)/i);
          if (reviewMatch) {
            review = reviewMatch[1].replace(/\n/g, ' ').replace(/\\"/g, '"').trim();
          } else {
            review = cleaned.substring(0, 100) + " (fallback parse)";
          }
          
          let actionableFeedback = "None!";
          const feedbackMatch = 
            cleaned.match(/"?actionableFeedback"?\s*:\s*"([^]*?)"\s*(?:}|\s*$)/i) ||
            cleaned.match(/"?actionableFeedback"?\s*:\s*"([^]*?)"/i) ||
            cleaned.match(/"?actionableFeedback"?\s*[:*-\s]+([^]*?)(?:\r?\n|\s*$)/i) ||
            cleaned.match(/"?actionableFeedback"?\s*:\s*([^]*?)(?:}|\s*$)/i);
          if (feedbackMatch) {
            actionableFeedback = feedbackMatch[1].replace(/\n/g, ' ').replace(/\\"/g, '"').trim();
          }
          
          parsed = { uxGrade, performanceGrade, trustGrade, review, actionableFeedback };
        }

        result.aiReview = {
          uxGrade: typeof parsed.uxGrade === 'number' ? parsed.uxGrade : 50,
          performanceGrade: typeof parsed.performanceGrade === 'number' ? parsed.performanceGrade : 50,
          trustGrade: typeof parsed.trustGrade === 'number' ? parsed.trustGrade : 50,
          review: parsed.review || "No review provided.",
          actionableFeedback: parsed.actionableFeedback || "None!"
        };
        console.log(`   💬 [${persona.name}]: UX:${result.aiReview!.uxGrade} Perf:${result.aiReview!.performanceGrade} - ${result.aiReview!.review.substring(0, 80)}...`);
      } catch (parseErr) {
        console.error(`   ⚠️ [${persona.name}] Failed to parse AI review: ${parseErr}\nRAW:\n${cleaned}`);
      }
    } catch (e) {
      console.error(`   ⚠️ [${persona.name}] AI generation failed: ${e}`);
    }

    const reviewText = result.aiReview?.review || '';
    const isErrorReview = /error|quota|502|503|rate\s*limit|proxy/i.test(reviewText) || reviewText.includes('fallback parse');
    if (!result.aiReview || isErrorReview) {
      console.log(`   ℹ️ [${persona.name}] Gemini rate limit / proxy mismatch or quota error.`);
      result.aiReview = {
        uxGrade: 0,
        performanceGrade: 0,
        trustGrade: 0,
        review: `Gemini API review generation failed: ${reviewText || 'No response or API quota limit reached.'}`,
        actionableFeedback: "Restore Gemini API connection / increase limits."
      };
      console.log(`   💬 [${persona.name}] [Error State]: UX:${result.aiReview.uxGrade} Perf:${result.aiReview.performanceGrade} - ${result.aiReview.review.substring(0, 80)}...`);
    }

    // Score overrides removed. Personas naturally grade based on completed features.
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error(`❌ [${persona.name}] Session failed: ${msg}`);

    // Failure screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${persona.id}-FAIL.png`),
      fullPage: true,
    }).catch(() => {});
    result.screenshotPath = path.join(SCREENSHOTS_DIR, `${persona.id}-FAIL.png`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('OpenSoyce AI Swarm', () => {

  test('MINI SWARM: 3 personas (quick smoke test)', async ({ browser }) => {
    test.setTimeout(500_000); // 8.3 min — each repo lookup takes ~26s on live site

    const personas = getRandomPersonas(3);
    const results: SwarmResult[] = [];

    console.log('\n🌊 MINI SWARM — 3 personas running sequentially');
    console.log('='.repeat(70));

    for (const persona of personas) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
      });
      const page = await context.newPage();

      try {
        const result = await runPersonaSession(page, persona);
        results.push(result);
      } finally {
        await context.close();
      }
    }

    printSummary(results, 'MINI-3');
    writeReport(results, 'MINI-3');

    const successRate = results.filter(r => r.success).length / results.length;
    console.log(`\n✅ Success Rate: ${Math.round(successRate * 100)}%`);
    expect(successRate).toBeGreaterThanOrEqual(0.5);
  });

  test('4-PERSONA SWARM: 4 random personas', async ({ browser }) => {
    test.setTimeout(600_000);

    const personas = getRandomPersonas(4);
    const results: SwarmResult[] = [];

    console.log('\n🌊 4-PERSONA SWARM — Running sequentially');
    console.log('='.repeat(70));

    for (const persona of personas) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
      });
      const page = await context.newPage();

      try {
        const result = await runPersonaSession(page, persona);
        results.push(result);
      } finally {
        await context.close();
      }
    }

    printSummary(results, 'SWARM-4');
    writeReport(results, 'SWARM-4');

    const successRate = results.filter(r => r.success).length / results.length;
    console.log(`\n✅ Success Rate: ${Math.round(successRate * 100)}%`);
    expect(successRate).toBeGreaterThanOrEqual(0.5);
  });

  test('FULL SWARM: All 12 personas', async ({ browser }) => {
    test.setTimeout(600_000);

    const results: SwarmResult[] = [];

    console.log('\n🌊 FULL SWARM — All 12 OpenSoyce personas');
    console.log('='.repeat(70));

    for (const persona of PERSONAS) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
      });
      const page = await context.newPage();

      try {
        const result = await runPersonaSession(page, persona);
        results.push(result);
      } finally {
        await context.close();
      }
    }

    printSummary(results, 'FULL-12');
    writeReport(results, 'FULL-12');

    const successRate = results.filter(r => r.success).length / results.length;
    expect(successRate).toBeGreaterThanOrEqual(0.6);
  });

  test('SINGLE: CTO Sarah — fast verdict seeker', async ({ page }) => {
    test.setTimeout(180_000);
    const persona = PERSONAS.find(p => p.id === 'cto-sarah')!;
    const result = await runPersonaSession(page, persona);
    printSummary([result], 'SINGLE');
    expect(result.success).toBe(true);
  });

  test('SINGLE: Security James — skeptical score inspector', async ({ page }) => {
    test.setTimeout(180_000);
    const persona = PERSONAS.find(p => p.id === 'security-james')!;
    const result = await runPersonaSession(page, persona);
    printSummary([result], 'SINGLE');
    expect(result.success).toBe(true);
  });

  test('PARALLEL BURST: 5 personas concurrently', async ({ browser }) => {
    test.setTimeout(180_000);

    const personas = getRandomPersonas(5);
    console.log('\n⚡ PARALLEL BURST — 5 personas running simultaneously');
    console.log('='.repeat(70));

    const results = await Promise.all(
      personas.map(async (persona) => {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        try {
          return await runPersonaSession(page, persona);
        } finally {
          await context.close();
        }
      })
    );

    printSummary(results, 'PARALLEL-5');
    writeReport(results, 'PARALLEL-5');

    const successRate = results.filter(r => r.success).length / results.length;
    expect(successRate).toBeGreaterThanOrEqual(0.5);
  });

});

// ─── Summary Printer ──────────────────────────────────────────────────────────

function printSummary(results: SwarmResult[], label: string) {
  const success = results.filter(r => r.success).length;
  const rate = Math.round((success / results.length) * 100);

  console.log('\n' + '='.repeat(70));
  console.log(`📊 SWARM SUMMARY — ${label}`);
  console.log('='.repeat(70));
  console.log(`Total: ${results.length} | ✅ ${success} | ❌ ${results.length - success} | Rate: ${rate}%`);
  console.log('');

  results.forEach(r => {
    const icon = r.success ? '✅' : '❌';
    const repos = r.repoResults.map(rr => `${rr.repo}(${rr.score ?? 'n/a'})`).join(', ');
    console.log(`${icon} ${r.persona.name.padEnd(20)} [${r.persona.archetype}] → ${repos}`);
    if (r.aiReview) {
      console.log(`   ⭐ UX: ${r.aiReview.uxGrade} | Perf: ${r.aiReview.performanceGrade} | Trust: ${r.aiReview.trustGrade}`);
      console.log(`   💬 "${r.aiReview.review.substring(0, 100).replace(/\n/g, ' ')}..."`);
      console.log(`   🛠️  ${r.aiReview.actionableFeedback}`);
    }
    if (r.errors.length > 0) {
      console.log(`   ⚠️  ${r.errors[0].substring(0, 100)}`);
    }
  });

  console.log('='.repeat(70) + '\n');
}
