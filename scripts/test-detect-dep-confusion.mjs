#!/usr/bin/env node
/**
 * detectDepConfusion verification with stubbed checkPublicRegistry.
 */
import { detectDepConfusion } from '../src/shared/detectDepConfusion.js';
import { parsePrivateFile } from '../src/shared/parsePrivateFile.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  // eslint-disable-next-line consistent-return
  return Promise.resolve().then(fn).then(
    () => { console.log(`PASS  ${name}`); passed += 1; },
    e => { console.log(`FAIL  ${name} -- ${e.message}`); failed += 1; },
  );
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(c, msg) { if (!c) throw new Error(msg); }

const stubExists = async () => true;
const stubMissing = async () => false;
const stubThrows = async () => { throw new Error('network down'); };

(async () => {
  // 1. Name not in private list → null.
  await test('name not in private list → null', async () => {
    const privateList = parsePrivateFile('foo');
    const result = await detectDepConfusion({
      name: 'lodash',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubExists },
    });
    eq(result, null, 'unlisted → null');
  });

  // 2. Name in list, public registry returns false → MEDIUM.
  await test('listed + public 404 → MEDIUM', async () => {
    const privateList = parsePrivateFile('mycompany-private-utils');
    const result = await detectDepConfusion({
      name: 'mycompany-private-utils',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubMissing },
    });
    ok(result, 'signal present');
    eq(result.confidence, 'MEDIUM', 'MEDIUM confidence');
    ok(result.reason.includes('verify your index priority'), 'reason text');
  });

  // 3. Name in list, public registry returns true → HIGH.
  await test('listed + public 200 → HIGH', async () => {
    const privateList = parsePrivateFile('mycompany-private-utils');
    const result = await detectDepConfusion({
      name: 'mycompany-private-utils',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubExists },
    });
    ok(result, 'signal present');
    eq(result.confidence, 'HIGH', 'HIGH confidence');
    ok(result.reason.includes('Active squat detected'), 'reason text says squat');
  });

  // 4. Static signal applies across ecosystems (no ecosystem tag on the file).
  await test('static signal fires for PyPI too when name is listed', async () => {
    const privateList = parsePrivateFile('mycompany-llm-tools # python lib');
    const result = await detectDepConfusion({
      name: 'mycompany-llm-tools',
      ecosystem: 'PyPI',
      privateList,
      deps: { checkPublicRegistry: stubMissing },
    });
    ok(result, 'signal present');
    eq(result.confidence, 'MEDIUM', 'MEDIUM');
    eq(result.userComment, 'python lib', 'user comment surfaced');
  });

  // 5. checkPublicRegistry throws → returns MEDIUM (static signal stands).
  await test('checkPublicRegistry throws → returns MEDIUM', async () => {
    const privateList = parsePrivateFile('mycompany-utils');
    const result = await detectDepConfusion({
      name: 'mycompany-utils',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubThrows },
    });
    ok(result, 'signal present');
    eq(result.confidence, 'MEDIUM', 'MEDIUM (no escalation on throw)');
  });

  // 6. userComment populated correctly.
  await test('userComment populated from trailing # comment', async () => {
    const privateList = parsePrivateFile('mycompany-internal # accept risk per ticket-123');
    const result = await detectDepConfusion({
      name: 'mycompany-internal',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubMissing },
    });
    eq(result.userComment, 'accept risk per ticket-123', 'userComment matches');
  });

  // 7. userComment is null when no comment in file.
  await test('userComment null when no trailing comment', async () => {
    const privateList = parsePrivateFile('mycompany-internal');
    const result = await detectDepConfusion({
      name: 'mycompany-internal',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubMissing },
    });
    eq(result.userComment, null, 'userComment is null');
  });

  // 8. Empty private list → null for any name.
  await test('empty private list → null for all names', async () => {
    const privateList = parsePrivateFile('');
    const result = await detectDepConfusion({
      name: 'lodash',
      ecosystem: 'npm',
      privateList,
      deps: { checkPublicRegistry: stubExists },
    });
    eq(result, null, 'empty list → null');
  });

  // 9. null privateList → null.
  await test('null privateList → null', async () => {
    const result = await detectDepConfusion({
      name: 'mycompany-utils',
      ecosystem: 'npm',
      privateList: null,
      deps: { checkPublicRegistry: stubExists },
    });
    eq(result, null, 'null list → null');
  });

  // 10. Invalid ecosystem → null.
  await test('invalid ecosystem → null', async () => {
    const privateList = parsePrivateFile('mycompany-utils');
    const result = await detectDepConfusion({
      name: 'mycompany-utils',
      ecosystem: 'rubygems',
      privateList,
      deps: { checkPublicRegistry: stubExists },
    });
    eq(result, null, 'unsupported ecosystem → null');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
