#!/usr/bin/env node
/**
 * Continuous Learning - Session Evaluator (Cross-Platform)
 *
 * Replaces evaluate-session.sh with pure Node.js.
 * Works on Windows, macOS, and Linux.
 *
 * Runs on Stop hook to extract reusable patterns from Claude Code sessions.
 */

const path = require('path');
const fs = require('fs');

// Navigate to scripts/lib relative to skills/continuous-learning/
const utilsPath = path.join(__dirname, '..', '..', 'scripts', 'lib');

let getLearnedSkillsDir, ensureDir, readFile, countInFile, logFn;
let resolveTildePath, loadConfig;

try {
  const utils = require(path.join(utilsPath, 'utils'));
  getLearnedSkillsDir = utils.getLearnedSkillsDir;
  ensureDir = utils.ensureDir;
  readFile = utils.readFile;
  countInFile = utils.countInFile;
  logFn = utils.log;

  const observerUtils = require(path.join(utilsPath, 'observer-utils'));
  resolveTildePath = observerUtils.resolveTildePath;
  loadConfig = observerUtils.loadConfig;
} catch {
  // If utils not found, exit silently
  process.exit(0);
}

async function main() {
  // Load config
  const configFile = path.join(__dirname, 'config.json');
  const config = loadConfig(configFile);

  let minSessionLength = 10;
  let learnedSkillsPath = getLearnedSkillsDir();

  if (config) {
    minSessionLength = config.min_session_length || 10;
    if (config.learned_skills_path) {
      learnedSkillsPath = resolveTildePath(config.learned_skills_path);
    }
  }

  // Ensure learned skills directory exists
  ensureDir(learnedSkillsPath);

  // Get transcript path from environment (set by Claude Code)
  const transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  // Count user messages in session
  const messageCount = countInFile(transcriptPath, /"type":"user"/g);

  // Skip short sessions
  if (messageCount < minSessionLength) {
    logFn(`[ContinuousLearning] Session too short (${messageCount} messages), skipping`);
    process.exit(0);
  }

  // Signal to Claude that session should be evaluated for extractable patterns
  logFn(`[ContinuousLearning] Session has ${messageCount} messages - evaluate for extractable patterns`);
  logFn(`[ContinuousLearning] Save learned skills to: ${learnedSkillsPath}`);

  process.exit(0);
}

main().catch(err => {
  console.error('[ContinuousLearning] Error:', err.message);
  process.exit(0);
});
