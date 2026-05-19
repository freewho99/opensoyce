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

async function callGemini(prompt: string): Promise<string> {
  const ai = getAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Direct Gemini API failed: ${err.message || err}. Falling back to proxy...`);
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
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Proxy returned ${res.status}: ${errText}`);
    }
    
    const data = await res.json() as any;
    if (data.text) {
      return data.text;
    }
    return '(Proxy returned no text)';
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
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
        for (const pillar of pillars) {
          const pillarRow = page.locator(`text=${pillar}`).first();
          if (await pillarRow.isVisible({ timeout: 1000 }).catch(() => false)) {
            const rowText = await pillarRow.evaluate(
              el => el.closest('div,tr,li')?.textContent ?? el.textContent
            ).catch(() => null);
            if (rowText) repoResult.pillars[pillar] = rowText.trim().substring(0, 60);
          }
        }

        // Screenshot the result
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `${persona.id}-${repo.replace('/', '-')}.png`),
          fullPage: false,
        });

        console.log(`   ✅ [${persona.name}] ${repo} → score: ${repoResult.score ?? 'not found'} (${repoResult.loadTimeMs}ms)`);

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
    const scores = result.repoResults.map(r => `${r.repo}: ${r.score ?? 'failed'}`).join(', ');
    const prompt = `You are ${persona.name}, a ${persona.role} with tech level "${persona.techLevel}".
Your goal visiting OpenSoyce was: "${persona.goal}".
Personality: patience=${persona.personality.patience}/10, criticalness=${persona.personality.criticalness}/10, curiosity=${persona.personality.curiosity}/10.
Behavior: ${persona.behaviorNotes}

You just looked up these repos and got these scores: ${scores}.
Load times: ${result.repoResults.map(r => `${r.repo} took ${r.loadTimeMs}ms`).join(', ')}.
${result.errors.length > 0 ? `Errors encountered: ${result.errors.join('; ')}` : 'No errors encountered.'}

Write a short, honest, in-character review (3-5 sentences) of your OpenSoyce experience.
Include: Did the scores seem useful? Was the UI intuitive? Would you use it again or share it?
Be realistic to your persona — not everyone is positive.

GROUNDING RULES - DO NOT HALLUCINATE MISSING FEATURES:
- The site ALREADY has a 7-tier verdict band (e.g. "FORKABLE", "STABLE") alongside the number for beginner context.
- The site ALREADY has a detailed /methodology page linked directly from the score card.
- The site ALREADY has a lightning-fast 5-minute LRU cache (you can see this if your load time was < 1000ms).
- The Security subscore is ALREADY fully integrated with the GitHub Advisory Database and .github/SECURITY.md.
- The homepage does NOT pre-fill example repos, it just has a clean text input.
Do NOT suggest adding these features in your actionableFeedback, as they already exist. Focus your feedback on the actual scores you saw, your specific load times, and deeper workflow improvements.

IMPORTANT: You MUST respond with ONLY a raw JSON object matching this schema:
{
  "uxGrade": 85,
  "performanceGrade": 90,
  "trustGrade": 70,
  "review": "Your immersive 3-5 sentence review string...",
  "actionableFeedback": "One clear, actionable piece of feedback for the developers."
}
CRITICAL: Do NOT use unescaped double quotes inside your strings. Do NOT include newlines or line breaks inside your strings. Keep the strings as a single continuous line.`;

    console.log(`   🧠 [${persona.name}] Generating AI review...`);
    try {
      const aiResponse = await callGemini(prompt);
      const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch (jsonErr) {
          const uxGrade = parseInt(cleaned.match(/"uxGrade"\s*:\s*(\d+)/)?.[1] || "0", 10);
          const performanceGrade = parseInt(cleaned.match(/"performanceGrade"\s*:\s*(\d+)/)?.[1] || "0", 10);
          const trustGrade = parseInt(cleaned.match(/"trustGrade"\s*:\s*(\d+)/)?.[1] || "0", 10);
          
          let review = "";
          const reviewMatch = cleaned.match(/"review"\s*:\s*"([^]*?)"/);
          if (reviewMatch) review = reviewMatch[1].replace(/\n/g, ' ').replace(/\\"/g, '"').trim();
          else review = cleaned.substring(0, 100) + " (fallback parse)";
          
          let actionableFeedback = "";
          const feedbackMatch = cleaned.match(/"actionableFeedback"\s*:\s*"([^]*?)"/);
          if (feedbackMatch) actionableFeedback = feedbackMatch[1].replace(/\n/g, ' ').replace(/\\"/g, '"').trim();
          else actionableFeedback = "No actionable feedback parsed.";
          
          parsed = { uxGrade, performanceGrade, trustGrade, review, actionableFeedback };
        }

        result.aiReview = {
          uxGrade: parsed.uxGrade ?? 0,
          performanceGrade: parsed.performanceGrade ?? 0,
          trustGrade: parsed.trustGrade ?? 0,
          review: parsed.review || "No review provided.",
          actionableFeedback: parsed.actionableFeedback || "No actionable feedback parsed."
        };
        console.log(`   💬 [${persona.name}]: UX:${result.aiReview!.uxGrade} Perf:${result.aiReview!.performanceGrade} - ${result.aiReview!.review.substring(0, 80)}...`);
      } catch (parseErr) {
        console.error(`   ⚠️ [${persona.name}] Failed to parse AI review: ${parseErr}\nRAW:\n${cleaned}`);
      }
    } catch (e) {
      console.error(`   ⚠️ [${persona.name}] AI generation failed: ${e}`);
    }

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
    test.setTimeout(300_000); // 5 min — each repo lookup takes ~26s on live site

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
    test.setTimeout(400_000);

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
    test.setTimeout(60_000);
    const persona = PERSONAS.find(p => p.id === 'cto-sarah')!;
    const result = await runPersonaSession(page, persona);
    printSummary([result], 'SINGLE');
    expect(result.success).toBe(true);
  });

  test('SINGLE: Security James — skeptical score inspector', async ({ page }) => {
    test.setTimeout(60_000);
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
