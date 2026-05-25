import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

// 1. Generate Ed25519 key pair
console.log('Generating Ed25519 keys...');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// 2. Set environment variables for the subprocess
process.env.OPENSOYCE_SIGNING_PRIVATE_KEY = privateKey;
process.env.OPENSOYCE_SIGNING_PUBLIC_KEY = publicKey;

try {
  // 3. Run scan report in JSON format (which will trigger signing because private key is set)
  console.log('Running scan and generating signed JSON report...');
  execSync('node scripts/opensoyce-scan-report.mjs package-lock.json --json report-signed.json --quiet', {
    env: process.env,
    stdio: 'inherit'
  });

  // 4. Verify signature on the generated JSON report
  console.log('\nVerifying signed JSON report...');
  const verifyOutput = execSync('node scripts/opensoyce-scan-report.mjs --verify report-signed.json', {
    env: process.env,
    encoding: 'utf8'
  });
  console.log(verifyOutput);

  console.log('🎉 SUCCESS: Report was signed and verified using live Ed25519 keys!');
} catch (error) {
  console.error('❌ FAILED:', error.message || error);
} finally {
  // Clean up
  if (existsSync('report-signed.json')) {
    unlinkSync('report-signed.json');
  }
}
