import { detectTypoSquat } from '../data/protectedPackageNames.js';

/**
 * Calculates character entropy of a text to detect base64/hex obfuscation.
 * Higher entropy means a more random character distribution.
 *
 * @param {string} str
 * @returns {number}
 */
export function calculateEntropy(str) {
  if (!str) return 0;
  const len = str.length;
  const freqs = {};
  for (let i = 0; i < len; i++) {
    const char = str[i];
    freqs[char] = (freqs[char] || 0) + 1;
  }
  let entropy = 0;
  for (const char in freqs) {
    const p = freqs[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Statically analyzes a package's script body content or file contents for malicious behavior.
 * Returns an object with { threatDetected: boolean, threatType: string | null, evidence: any }
 *
 * @param {string} packageName
 * @param {string} version
 * @param {'npm'|'PyPI'} ecosystem
 * @param {string} scriptsText
 * @param {string[]} fileContentsArray
 * @returns {{ threatDetected: boolean, threatType: string | null, evidence: any }}
 */
export function analyzePackageContent(packageName, version, ecosystem, scriptsText, fileContentsArray = []) {
  // 1. Typosquat Check
  const typosquat = detectTypoSquat(packageName);
  if (typosquat) {
    return {
      threatDetected: true,
      threatType: 'typosquat',
      evidence: {
        suspectedTarget: typosquat.suspectedTarget,
        reason: `Package name "${packageName}" is a possible homoglyph typosquat of protected package "${typosquat.suspectedTarget}".`
      }
    };
  }

  // Combine scripts and text files for script scanning
  const allTextToScan = [
    scriptsText || '',
    ...fileContentsArray
  ].join('\n');

  if (!allTextToScan.trim()) {
    return { threatDetected: false, threatType: null, evidence: {} };
  }

  // 2. Suspicious Obfuscation Check
  // We check for high entropy blocks or base64 decoding paired with dynamic execution (eval/Function)
  const base64EvalPattern = /(?:atob|Buffer\.from\s*\(\s*(?:[a-zA-Z0-9_-]+|['"][a-zA-Z0-9+/=]+['"])\s*,\s*['"]base64['"]\s*\)|[a-zA-Z0-9+/=]{30,})\s*(?:\.toString\s*\(\s*\))?\s*[\s\S]{0,200}?\b(?:eval|Function|vm\.runInContext)\b/;
  const hexEvalPattern = /(?:\\x[0-9a-fA-F]{2}){8,}[\s\S]*?(?:eval|Function|vm)/;

  if (base64EvalPattern.test(allTextToScan)) {
    const match = allTextToScan.match(base64EvalPattern);
    return {
      threatDetected: true,
      threatType: 'obfuscated_payload',
      evidence: {
        snippet: match[0].slice(0, 300),
        reason: 'Detected base64 encoded text block coupled with dynamic evaluation (eval/Function/vm).'
      }
    };
  }

  if (hexEvalPattern.test(allTextToScan)) {
    const match = allTextToScan.match(hexEvalPattern);
    return {
      threatDetected: true,
      threatType: 'obfuscated_payload',
      evidence: {
        snippet: match[0].slice(0, 300),
        reason: 'Detected long hex escape sequences coupled with dynamic evaluation.'
      }
    };
  }

  // 3. Suspicious Network / Exfiltration footprints
  // Looks for script lines curling/wget-ing to sensitive env var directories or webhook endpoints
  const exfilPattern = /(?:curl|wget|fetch|axios|http\.get|https\.get)[\s\S]{0,200}?(?:process\.env|env|APPDATA|HOME|localStorage|sessionStorage|cookie)/i;
  // Look for hardcoded webhook URLs or dynamic reverse shells
  const reverseShellPattern = /(?:sh|bash|cmd|powershell|zsh)[\s\S]{0,100}?(?:-i|>&\s*\/dev\/tcp|New-Object\s+System\.Net\.Sockets)/i;

  if (exfilPattern.test(allTextToScan)) {
    const match = allTextToScan.match(exfilPattern);
    return {
      threatDetected: true,
      threatType: 'suspicious_network',
      evidence: {
        snippet: match[0].slice(0, 300),
        reason: 'Detected script logic fetching/sending data referencing environment/sensitive directories.'
      }
    };
  }

  if (reverseShellPattern.test(allTextToScan)) {
    const match = allTextToScan.match(reverseShellPattern);
    return {
      threatDetected: true,
      threatType: 'malicious_script',
      evidence: {
        snippet: match[0].slice(0, 300),
        reason: 'Detected reverse shell or shell-spawning network connectivity footprint.'
      }
    };
  }

  // 4. Large Base64 Block Entropy check (Zero-day check)
  // Look for dense strings of base64 > 500 chars (not typical for source code, except inline assets)
  const largeBase64Re = /[a-zA-Z0-9+/=]{500,}/g;
  let base64Match;
  while ((base64Match = largeBase64Re.exec(allTextToScan)) !== null) {
    const block = base64Match[0];
    const entropy = calculateEntropy(block);
    // Base64 encoding of standard encrypted or packed binary data generally has high entropy (> 5.5)
    if (entropy > 5.5 && (allTextToScan.includes('eval') || allTextToScan.includes('Function') || allTextToScan.includes('exec'))) {
      return {
        threatDetected: true,
        threatType: 'obfuscated_payload',
        evidence: {
          snippet: block.slice(0, 100) + '...',
          entropy,
          reason: `Detected high-entropy block (entropy=${entropy.toFixed(2)}) indicating encrypted/packed content alongside evaluation keys.`
        }
      };
    }
  }

  return { threatDetected: false, threatType: null, evidence: {} };
}
