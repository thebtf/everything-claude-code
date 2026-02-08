#!/usr/bin/env node
/**
 * Continuous Learning v2 - Observation Analyzer (Cross-Platform)
 *
 * Replaces start-observer.sh background daemon.
 * Runs at SessionEnd instead of as a persistent daemon.
 * Works on Windows, macOS, and Linux.
 *
 * Key architectural change: eliminates the daemon entirely.
 * Unix signals (SIGUSR1), kill -0, trap, disown, PID files - none work on Windows.
 * SessionEnd hook achieves the same result without process management.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const {
  log,
  readFile,
  writeFile,
  commandExists
} = require('../lib/utils');

const {
  isDisabled,
  getHomunculusDir,
  getObservationsFile,
  countObservations,
  archiveObservations,
  resetCounter,
  loadConfig
} = require('../lib/observer-utils');

const MIN_OBSERVATIONS_DEFAULT = 20;

async function main() {
  // Skip if disabled
  if (isDisabled()) {
    process.exit(0);
  }

  // Load config
  const configPath = path.join(
    __dirname, '..', '..', 'skills', 'continuous-learning-v2', 'config.json'
  );
  const config = loadConfig(configPath);

  const minObservations = (config && config.observer && config.observer.min_observations_to_analyze)
    || MIN_OBSERVATIONS_DEFAULT;

  // Determine observations file
  const observationsFile = (config && config.observation && config.observation.store_path)
    || getObservationsFile();

  // Check observation count
  const obsCount = countObservations(observationsFile);

  if (obsCount < minObservations) {
    log(`[Observer] ${obsCount} observations (need ${minObservations}) - skipping analysis`);
    process.exit(0);
  }

  log(`[Observer] Analyzing ${obsCount} observations...`);

  // Try to run analysis via claude CLI
  if (commandExists('claude')) {
    const homunculusDir = getHomunculusDir();
    const instinctsDir = path.join(homunculusDir, 'instincts', 'personal');

    const prompt = [
      `Read ${observationsFile} and identify patterns.`,
      `If you find 3+ occurrences of the same pattern, create an instinct file`,
      `in ${instinctsDir}/ following the instinct format`,
      `(YAML frontmatter with id, trigger, confidence, domain, source fields).`,
      `Be conservative - only create instincts for clear patterns.`
    ].join(' ');

    const result = spawnSync('claude', [
      '--model', 'haiku',
      '--max-turns', '3',
      '--print',
      prompt
    ], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 120000
    });

    if (result.status === 0) {
      log('[Observer] Analysis complete');
    } else {
      log(`[Observer] Analysis returned non-zero: ${(result.stderr || '').slice(0, 200)}`);
    }

    // Archive processed observations
    archiveObservations(observationsFile);

    // Reset counter
    const sessionId = process.env.CLAUDE_SESSION_ID || 'default';
    resetCounter(sessionId);
  } else {
    // Claude CLI not available - write pending marker
    const pendingFile = path.join(getHomunculusDir(), '.pending-analysis');
    writeFile(pendingFile, `${new Date().toISOString()}\n${obsCount} observations pending analysis\n`);
    log('[Observer] Claude CLI not in PATH - marked for pending analysis');
  }

  process.exit(0);
}

main().catch(err => {
  log(`[Observer] Error: ${err.message}`);
  process.exit(0);
});
