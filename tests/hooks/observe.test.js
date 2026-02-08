/**
 * Tests for observe.js hook
 *
 * Run with: node tests/hooks/observe.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// Test helper
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

// Async test helper
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

// Run observe.js with given stdin input
function runObserveScript(input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      __dirname, '..', '..', 'skills', 'continuous-learning-v2', 'hooks', 'observe.js'
    );

    const proc = spawn('node', [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

async function runTests() {
  console.log('\n=== Testing observe.js Hook ===\n');

  let passed = 0;
  let failed = 0;

  // Setup: create temp homunculus dir for tests
  const testHomunculusDir = path.join(os.tmpdir(), `homunculus-test-${Date.now()}`);
  fs.mkdirSync(testHomunculusDir, { recursive: true });

  console.log('observe.js:');

  if (await asyncTest('exits 0 with empty stdin', async () => {
    const result = await runObserveScript('');
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('exits 0 with invalid JSON stdin', async () => {
    const result = await runObserveScript('not json at all');
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('exits 0 with empty JSON object', async () => {
    const result = await runObserveScript('{}');
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('exits 0 with valid PreToolUse input', async () => {
    const input = JSON.stringify({
      hook_type: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/test/file.js' },
      session_id: 'test-session-123'
    });
    const result = await runObserveScript(input);
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('exits 0 with valid PostToolUse input', async () => {
    const input = JSON.stringify({
      hook_type: 'PostToolUse',
      tool_name: 'Write',
      tool_output: { success: true },
      session_id: 'test-session-456'
    });
    const result = await runObserveScript(input);
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  // Cleanup
  fs.rmSync(testHomunculusDir, { recursive: true, force: true });

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
