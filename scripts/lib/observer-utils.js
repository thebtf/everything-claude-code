/**
 * Cross-platform utility functions for the continuous-learning-v2 observation system
 * Works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  getHomeDir,
  ensureDir,
  readFile,
  appendFile,
  getTempDir,
  log,
  commandExists
} = require('./utils');

/**
 * Resolve tilde (~) in paths to the user's home directory and normalize
 * @param {string} p - Path that may contain ~
 * @returns {string} Resolved and normalized path
 */
function resolveTildePath(p) {
  if (!p) return p;
  return path.normalize(p.replace(/^~([/\\]|$)/, getHomeDir() + path.sep));
}

/**
 * Get the homunculus directory (~/.claude/homunculus)
 * @returns {string} Path to homunculus directory
 */
function getHomunculusDir() {
  const dir = path.join(getHomeDir(), '.claude', 'homunculus');
  ensureDir(dir);
  return dir;
}

/**
 * Get the default observations file path
 * @returns {string} Path to observations.jsonl
 */
function getObservationsFile() {
  return path.join(getHomunculusDir(), 'observations.jsonl');
}

/**
 * Load and parse config.json, resolving all tilde paths
 * @param {string} configPath - Path to config.json
 * @returns {object} Parsed config with resolved paths
 */
function loadConfig(configPath) {
  const content = readFile(configPath);
  if (!content) return null;

  try {
    const config = JSON.parse(content);

    // Resolve tilde paths in known config fields
    if (config.observation && config.observation.store_path) {
      config.observation.store_path = resolveTildePath(config.observation.store_path);
    }
    if (config.instincts) {
      if (config.instincts.personal_path) {
        config.instincts.personal_path = resolveTildePath(config.instincts.personal_path);
      }
      if (config.instincts.inherited_path) {
        config.instincts.inherited_path = resolveTildePath(config.instincts.inherited_path);
      }
    }
    if (config.evolution && config.evolution.evolved_path) {
      config.evolution.evolved_path = resolveTildePath(config.evolution.evolved_path);
    }
    if (config.learned_skills_path) {
      config.learned_skills_path = resolveTildePath(config.learned_skills_path);
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Check if observation system is disabled
 * @returns {boolean} True if disabled flag file exists
 */
function isDisabled() {
  return fs.existsSync(path.join(getHomunculusDir(), 'disabled'));
}

/**
 * Get file size in bytes (returns 0 if file doesn't exist)
 * @param {string} filePath - Path to file
 * @returns {number} File size in bytes
 */
function getFileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Rotate observations file if it exceeds maxMB
 * @param {string} file - Path to observations file
 * @param {number} maxMB - Maximum file size in megabytes
 * @returns {boolean} True if rotation occurred
 */
function rotateObservationsIfNeeded(file, maxMB) {
  const sizeBytes = getFileSizeBytes(file);
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeMB < maxMB) return false;

  const archiveDir = path.join(path.dirname(file), 'observations.archive');
  ensureDir(archiveDir);

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `observations-${timestamp}.jsonl`;

  fs.renameSync(file, path.join(archiveDir, archiveName));
  return true;
}

/**
 * Append an observation object as JSONL
 * @param {string} file - Path to observations file
 * @param {object} obj - Observation object to append
 */
function appendObservation(file, obj) {
  appendFile(file, JSON.stringify(obj) + '\n');
}

/**
 * Count observations (lines) in a JSONL file
 * @param {string} file - Path to JSONL file
 * @returns {number} Number of lines
 */
function countObservations(file) {
  const content = readFile(file);
  if (!content) return 0;
  return content.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Archive observations file with a dated name
 * @param {string} file - Path to observations file
 */
function archiveObservations(file) {
  if (!fs.existsSync(file)) return;

  const archiveDir = path.join(path.dirname(file), 'observations.archive');
  ensureDir(archiveDir);

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `processed-${timestamp}.jsonl`;

  fs.renameSync(file, path.join(archiveDir, archiveName));
}

/**
 * Sanitize a session ID for use in file names
 * Strips path separators and non-safe characters to prevent path traversal
 * @param {string} sessionId - Raw session identifier
 * @returns {string} Safe file name component
 */
function sanitizeSessionId(sessionId) {
  return String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * Increment a session-based counter (stored in temp file)
 * @param {string} sessionId - Session identifier
 * @returns {number} Updated counter value
 */
function incrementCounter(sessionId) {
  const counterFile = path.join(getTempDir(), `claude-obs-count-${sanitizeSessionId(sessionId)}`);
  let count = 1;

  try {
    const existing = fs.readFileSync(counterFile, 'utf8').trim();
    count = parseInt(existing, 10) + 1;
  } catch {
    // File doesn't exist yet
  }

  fs.writeFileSync(counterFile, String(count), 'utf8');
  return count;
}

/**
 * Reset the session counter
 * @param {string} sessionId - Session identifier
 */
function resetCounter(sessionId) {
  const counterFile = path.join(getTempDir(), `claude-obs-count-${sanitizeSessionId(sessionId)}`);
  try {
    fs.unlinkSync(counterFile);
  } catch {
    // File doesn't exist
  }
}

/**
 * Get current counter value
 * @param {string} sessionId - Session identifier
 * @returns {number} Current counter value
 */
function getCounter(sessionId) {
  const counterFile = path.join(getTempDir(), `claude-obs-count-${sanitizeSessionId(sessionId)}`);
  try {
    return parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
  } catch {
    return 0;
  }
}

// Cache for Python command lookup (undefined = not cached, null = cached as absent)
let cachedPythonCommand = undefined;

/**
 * Find a working Python command on the system
 * Tries python3, python, py in order
 * @returns {string|null} Python command name or null if not found
 */
function findPythonCommand() {
  if (cachedPythonCommand !== undefined) return cachedPythonCommand;

  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ['--version'], { stdio: 'pipe', timeout: 5000 });
      if (result.status === 0) {
        cachedPythonCommand = cmd;
        return cmd;
      }
    } catch {
      // Command not found
    }
  }

  cachedPythonCommand = null;
  return null;
}

/**
 * Run the instinct CLI Python script
 * @param {string[]} args - CLI arguments
 * @param {string} pluginRoot - Plugin root directory
 * @returns {object} { success: boolean, stdout: string, stderr: string }
 */
function runInstinctCli(args, pluginRoot) {
  const pythonCmd = findPythonCommand();
  if (!pythonCmd) {
    return {
      success: false,
      stdout: '',
      stderr: 'Python not found. Install Python 3 and ensure it is in PATH.'
    };
  }

  const scriptPath = path.join(
    pluginRoot,
    'skills', 'continuous-learning-v2', 'scripts', 'instinct-cli.py'
  );

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      stdout: '',
      stderr: `instinct-cli.py not found at: ${scriptPath}`
    };
  }

  const result = spawnSync(pythonCmd, [scriptPath, ...args], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 30000
  });

  return {
    success: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

module.exports = {
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
  findPythonCommand,
  runInstinctCli
};
