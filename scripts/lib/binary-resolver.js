/**
 * Binary resolver for Claude Code hooks
 *
 * Finds tool binaries (prettier, tsc, etc.) without touching project node_modules.
 * Priority:
 *   1. System PATH
 *   2. ~/.claude/hooks-packages/node_modules/.bin/
 *   3. Auto-install to ~/.claude/hooks-packages/ (first use only)
 *
 * Cross-platform (Windows, macOS, Linux)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const isWindows = process.platform === 'win32';

/**
 * Directory where hooks-managed packages are installed.
 * Never touches project node_modules.
 */
function getHooksPackagesDir() {
  return path.join(os.homedir(), '.claude', 'hooks-packages');
}

/**
 * .bin directory inside hooks-managed packages.
 */
function getHooksBinDir() {
  return path.join(getHooksPackagesDir(), 'node_modules', '.bin');
}

/**
 * Find a binary in the system PATH.
 * Returns full path or null.
 */
function findInPath(name) {
  try {
    const cmd = isWindows ? 'where.exe' : 'which';
    const bin = isWindows ? `${name}.cmd` : name;
    const result = execFileSync(cmd, [bin], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    });
    const found = result.trim().split(/\r?\n/)[0].trim();
    return found || null;
  } catch {
    return null;
  }
}

/**
 * Find a binary in the hooks-managed packages directory.
 * Returns full path or null.
 */
function findInHooksPackages(name) {
  const binDir = getHooksBinDir();
  const candidates = isWindows
    ? [`${name}.cmd`, `${name}.ps1`, name]
    : [name];

  for (const candidate of candidates) {
    const full = path.join(binDir, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * Install a package to ~/.claude/hooks-packages/ using npm.
 * Outputs progress to stderr so the user sees it happen once.
 * Returns true on success, false on failure.
 */
function installToHooksPackages(packageName) {
  const prefix = getHooksPackagesDir();
  try {
    fs.mkdirSync(prefix, { recursive: true });
  } catch {
    return false;
  }

  const npm = isWindows ? 'npm.cmd' : 'npm';
  process.stderr.write(
    `[Hook] Installing ${packageName} to user scope (~/.claude/hooks-packages/)...\n`
  );

  try {
    execFileSync(npm, ['install', '--prefix', prefix, '--no-save', packageName], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      encoding: 'utf8',
    });
    process.stderr.write(`[Hook] ${packageName} installed successfully.\n`);
    return true;
  } catch (err) {
    process.stderr.write(
      `[Hook] Failed to install ${packageName}: ${(err.stderr || err.message || '').slice(0, 200)}\n`
    );
    process.stderr.write(
      `[Hook] To enable this hook manually: npm install -g ${packageName}\n`
    );
    return false;
  }
}

/**
 * Find or install a binary.
 *
 * @param {string} packageName - npm package name (e.g. 'prettier', 'typescript')
 * @param {string} binaryName  - binary name inside the package (e.g. 'prettier', 'tsc')
 * @returns {string|null} - full path to binary, or null if unavailable
 */
function findOrInstall(packageName, binaryName) {
  // 1. Check system PATH first
  const inPath = findInPath(binaryName);
  if (inPath) return inPath;

  // 2. Check ~/.claude/hooks-packages/
  const inHooks = findInHooksPackages(binaryName);
  if (inHooks) return inHooks;

  // 3. First use: install to user scope, then locate
  const installed = installToHooksPackages(packageName);
  if (installed) {
    return findInHooksPackages(binaryName);
  }

  return null;
}

module.exports = { findOrInstall, findInPath, findInHooksPackages, getHooksPackagesDir };
