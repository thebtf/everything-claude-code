#!/usr/bin/env node
/**
 * PostToolUse Hook: Auto-format JS/TS files with Prettier after edits
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Uses binary-resolver to find prettier:
 *   1. System PATH (global install)
 *   2. ~/.claude/hooks-packages/node_modules/.bin/
 *   3. Auto-install to user scope on first use (no project node_modules)
 */

const { execFileSync } = require('child_process');
const path = require('path');

const MAX_STDIN = 1024 * 1024; // 1MB limit
let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path;

    if (filePath && /\.(ts|tsx|js|jsx)$/.test(filePath)) {
      try {
        const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
        if (!pluginRoot) throw new Error('CLAUDE_PLUGIN_ROOT not set');

        const { findOrInstall } = require(path.join(pluginRoot, 'scripts', 'lib', 'binary-resolver'));
        const prettierBin = findOrInstall('prettier', 'prettier');

        if (prettierBin) {
          execFileSync(prettierBin, ['--write', filePath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 15000,
          });
        }
      } catch {
        // Binary not available or format failed — non-blocking
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
