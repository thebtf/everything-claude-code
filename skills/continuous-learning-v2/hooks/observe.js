#!/usr/bin/env node
/**
 * Continuous Learning v2 - Observation Hook (Cross-Platform)
 *
 * Replaces observe.sh with pure Node.js implementation.
 * Works on Windows, macOS, and Linux.
 *
 * Captures tool use events for pattern analysis.
 * Claude Code passes hook data via stdin as JSON.
 *
 * Hook config (in hooks.json or ~/.claude/settings.json):
 * {
 *   "PreToolUse": [{
 *     "matcher": "*",
 *     "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.js\"" }]
 *   }],
 *   "PostToolUse": [{
 *     "matcher": "*",
 *     "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.js\"" }]
 *   }]
 * }
 */

const path = require('path');

// Resolve utils relative to plugin root (navigate from skills/continuous-learning-v2/hooks/)
const utilsPath = path.join(__dirname, '..', '..', '..', 'scripts', 'lib');

let readStdinJson, log;
let isDisabled, getObservationsFile, rotateObservationsIfNeeded,
  appendObservation, incrementCounter, loadConfig;

try {
  const utils = require(path.join(utilsPath, 'utils'));
  readStdinJson = utils.readStdinJson;
  log = utils.log;

  const observerUtils = require(path.join(utilsPath, 'observer-utils'));
  isDisabled = observerUtils.isDisabled;
  getObservationsFile = observerUtils.getObservationsFile;
  rotateObservationsIfNeeded = observerUtils.rotateObservationsIfNeeded;
  appendObservation = observerUtils.appendObservation;
  incrementCounter = observerUtils.incrementCounter;
  loadConfig = observerUtils.loadConfig;
} catch {
  // If utils not found, exit silently (hooks must never block)
  process.exit(0);
}

async function main() {
  // Skip if disabled
  if (isDisabled()) {
    process.exit(0);
  }

  // Read hook data from stdin
  let hookData;
  try {
    hookData = await readStdinJson();
  } catch {
    process.exit(0);
  }

  if (!hookData || Object.keys(hookData).length === 0) {
    process.exit(0);
  }

  // Load config for max file size
  const configPath = path.join(__dirname, '..', 'config.json');
  const config = loadConfig(configPath);
  const maxFileSizeMB = (config && config.observation && config.observation.max_file_size_mb) || 10;

  // Determine observations file
  const observationsFile = (config && config.observation && config.observation.store_path)
    || getObservationsFile();

  // Parse hook data natively (no Python needed)
  const hookType = hookData.hook_type || 'unknown';
  const toolName = hookData.tool_name || hookData.tool || 'unknown';
  const toolInput = hookData.tool_input || hookData.input || {};
  const toolOutput = hookData.tool_output || hookData.output || '';
  const sessionId = hookData.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';

  // Truncate large inputs/outputs to 5000 chars
  let inputStr = null;
  let outputStr = null;

  if (hookType.includes('Pre') || hookType === 'unknown') {
    inputStr = typeof toolInput === 'object'
      ? JSON.stringify(toolInput).slice(0, 5000)
      : String(toolInput).slice(0, 5000);
  }

  if (hookType.includes('Post')) {
    outputStr = typeof toolOutput === 'object'
      ? JSON.stringify(toolOutput).slice(0, 5000)
      : String(toolOutput).slice(0, 5000);
  }

  const event = hookType.includes('Pre') ? 'tool_start' : 'tool_complete';

  // Rotate if file too large
  rotateObservationsIfNeeded(observationsFile, maxFileSizeMB);

  // Build observation object
  const observation = {
    timestamp: new Date().toISOString(),
    event,
    tool: toolName,
    session: sessionId
  };

  if (inputStr) observation.input = inputStr;
  if (outputStr) observation.output = outputStr;

  // Append observation
  appendObservation(observationsFile, observation);

  // Increment counter (replaces kill -USR1 signal)
  incrementCounter(sessionId);

  process.exit(0);
}

main().catch(() => {
  // Hooks must never block - exit silently on any error
  process.exit(0);
});
