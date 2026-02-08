/**
 * Tests for observer-utils.js
 *
 * Run with: node tests/lib/observer-utils.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  resolveTildePath,
  getHomunculusDir,
  getObservationsFile,
  loadConfig,
  isDisabled,
  getFileSizeBytes,
  rotateObservationsIfNeeded,
  appendObservation,
  countObservations,
  archiveObservations,
  incrementCounter,
  resetCounter,
  getCounter,
  findPythonCommand
} = require('../../scripts/lib/observer-utils');

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

// Create a temporary test directory
function createTestDir() {
  const testDir = path.join(os.tmpdir(), `observer-utils-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Clean up test directory
function cleanupTestDir(testDir) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

function runTests() {
  console.log('\n=== Testing observer-utils.js ===\n');

  let passed = 0;
  let failed = 0;

  // resolveTildePath tests
  console.log('resolveTildePath:');

  if (test('resolves ~ to home directory', () => {
    const result = resolveTildePath('~/test/path');
    const expected = path.normalize(path.join(os.homedir(), 'test', 'path'));
    assert.strictEqual(result, expected);
  })) passed++; else failed++;

  if (test('returns non-tilde paths unchanged', () => {
    const input = '/absolute/path/here';
    const result = resolveTildePath(input);
    assert.strictEqual(result, path.normalize(input));
  })) passed++; else failed++;

  if (test('handles null/empty input', () => {
    assert.strictEqual(resolveTildePath(''), '');
    assert.strictEqual(resolveTildePath(null), null);
  })) passed++; else failed++;

  if (test('resolves ~ at start with forward slash', () => {
    const result = resolveTildePath('~/.claude/test');
    assert.ok(result.includes('.claude'));
    assert.ok(!result.includes('~'));
  })) passed++; else failed++;

  // getFileSizeBytes tests
  console.log('\ngetFileSizeBytes:');

  if (test('returns correct size for existing file', () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'hello world');
    const size = getFileSizeBytes(testFile);
    assert.strictEqual(size, 11);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (test('returns 0 for non-existent file', () => {
    const size = getFileSizeBytes('/nonexistent/file/path');
    assert.strictEqual(size, 0);
  })) passed++; else failed++;

  // countObservations tests
  console.log('\ncountObservations:');

  if (test('counts JSONL lines correctly', () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'obs.jsonl');
    fs.writeFileSync(testFile, '{"a":1}\n{"b":2}\n{"c":3}\n');
    const count = countObservations(testFile);
    assert.strictEqual(count, 3);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (test('returns 0 for empty file', () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'empty.jsonl');
    fs.writeFileSync(testFile, '');
    const count = countObservations(testFile);
    assert.strictEqual(count, 0);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (test('returns 0 for non-existent file', () => {
    const count = countObservations('/nonexistent/file');
    assert.strictEqual(count, 0);
  })) passed++; else failed++;

  // appendObservation tests
  console.log('\nappendObservation:');

  if (test('appends JSONL correctly', () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'obs.jsonl');
    appendObservation(testFile, { event: 'test', tool: 'Read' });
    appendObservation(testFile, { event: 'test2', tool: 'Write' });
    const content = fs.readFileSync(testFile, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 2);
    assert.deepStrictEqual(JSON.parse(lines[0]), { event: 'test', tool: 'Read' });
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // rotateObservationsIfNeeded tests
  console.log('\nrotateObservationsIfNeeded:');

  if (test('does not rotate small files', () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'obs.jsonl');
    fs.writeFileSync(testFile, '{"test":true}\n');
    const rotated = rotateObservationsIfNeeded(testFile, 10);
    assert.strictEqual(rotated, false);
    assert.ok(fs.existsSync(testFile));
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // incrementCounter / getCounter / resetCounter tests
  console.log('\ncounter functions:');

  if (test('incrementCounter starts at 1', () => {
    const sessionId = `test-counter-${Date.now()}`;
    const count = incrementCounter(sessionId);
    assert.strictEqual(count, 1);
    resetCounter(sessionId);
  })) passed++; else failed++;

  if (test('incrementCounter increments correctly', () => {
    const sessionId = `test-counter2-${Date.now()}`;
    incrementCounter(sessionId);
    incrementCounter(sessionId);
    const count = incrementCounter(sessionId);
    assert.strictEqual(count, 3);
    assert.strictEqual(getCounter(sessionId), 3);
    resetCounter(sessionId);
  })) passed++; else failed++;

  if (test('resetCounter clears the counter', () => {
    const sessionId = `test-counter3-${Date.now()}`;
    incrementCounter(sessionId);
    resetCounter(sessionId);
    assert.strictEqual(getCounter(sessionId), 0);
  })) passed++; else failed++;

  // loadConfig tests
  console.log('\nloadConfig:');

  if (test('loads and resolves tilde paths', () => {
    const testDir = createTestDir();
    const configFile = path.join(testDir, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      observation: { store_path: '~/.claude/obs.jsonl' },
      learned_skills_path: '~/.claude/skills/learned/'
    }));
    const config = loadConfig(configFile);
    assert.ok(config);
    assert.ok(!config.observation.store_path.includes('~'));
    assert.ok(config.observation.store_path.includes('.claude'));
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (test('returns null for non-existent config', () => {
    const config = loadConfig('/nonexistent/config.json');
    assert.strictEqual(config, null);
  })) passed++; else failed++;

  if (test('returns null for invalid JSON', () => {
    const testDir = createTestDir();
    const configFile = path.join(testDir, 'bad.json');
    fs.writeFileSync(configFile, 'not json');
    const config = loadConfig(configFile);
    assert.strictEqual(config, null);
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // findPythonCommand tests
  console.log('\nfindPythonCommand:');

  if (test('returns a string or null', () => {
    const result = findPythonCommand();
    assert.ok(result === null || typeof result === 'string');
  })) passed++; else failed++;

  // archiveObservations tests
  console.log('\narchiveObservations:');

  if (test('moves file to archive directory', () => {
    const testDir = createTestDir();
    const testFile = path.join(testDir, 'obs.jsonl');
    fs.writeFileSync(testFile, '{"test":true}\n');
    archiveObservations(testFile);
    assert.ok(!fs.existsSync(testFile), 'Original file should be removed');
    const archiveDir = path.join(testDir, 'observations.archive');
    assert.ok(fs.existsSync(archiveDir), 'Archive directory should exist');
    const files = fs.readdirSync(archiveDir);
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].startsWith('processed-'));
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (test('handles non-existent file gracefully', () => {
    // Should not throw
    archiveObservations('/nonexistent/file.jsonl');
  })) passed++; else failed++;

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
