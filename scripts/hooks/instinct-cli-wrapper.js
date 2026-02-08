#!/usr/bin/env node
/**
 * Instinct CLI Wrapper (Cross-Platform)
 *
 * Thin wrapper that finds Python and runs instinct-cli.py.
 * Replaces direct `python3 instinct-cli.py` references in commands.
 * Works on Windows, macOS, and Linux.
 *
 * Usage:
 *   node instinct-cli-wrapper.js status
 *   node instinct-cli-wrapper.js import <file>
 *   node instinct-cli-wrapper.js export [--domain <name>]
 *   node instinct-cli-wrapper.js evolve [--generate]
 */

const path = require('path');

// Resolve plugin root - navigate from scripts/hooks/ to repo root
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
  || path.join(__dirname, '..', '..');

let findPythonCommand, runInstinctCli, log;

try {
  const observerUtils = require(path.join(pluginRoot, 'scripts', 'lib', 'observer-utils'));
  findPythonCommand = observerUtils.findPythonCommand;
  runInstinctCli = observerUtils.runInstinctCli;

  const utils = require(path.join(pluginRoot, 'scripts', 'lib', 'utils'));
  log = utils.log;
} catch (err) {
  console.error(`[instinct-cli] Failed to load utils: ${err.message}`);
  process.exit(1);
}

// Pass through all CLI args to the Python script
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node instinct-cli-wrapper.js <command> [args...]');
  console.error('Commands: status, import, export, evolve');
  process.exit(1);
}

// Check Python availability first
const pythonCmd = findPythonCommand();
if (!pythonCmd) {
  log('[instinct-cli] Python not found. Install Python 3 and ensure it is in PATH.');
  log('[instinct-cli] Tried: python3, python, py');
  process.exit(1);
}

// Run the CLI
const result = runInstinctCli(args, pluginRoot);

// Forward output
if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exit(result.success ? 0 : 1);
