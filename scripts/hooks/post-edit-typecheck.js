#!/usr/bin/env node
/**
 * PostToolUse Hook: TypeScript check after editing .ts/.tsx files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Uses binary-resolver to find tsc:
 *   1. System PATH (global install)
 *   2. ~/.claude/hooks-packages/node_modules/.bin/
 *   3. Auto-install typescript to user scope on first use (no project node_modules)
 *
 * Walks up from the file's directory to find the nearest tsconfig.json,
 * then runs tsc --noEmit and reports only errors related to the edited file.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
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

    if (filePath && /\.(ts|tsx)$/.test(filePath)) {
      const resolvedPath = path.resolve(filePath);
      if (!fs.existsSync(resolvedPath)) {
        process.stdout.write(data);
        process.exit(0);
      }

      // Find nearest tsconfig.json by walking up (max 20 levels)
      let dir = path.dirname(resolvedPath);
      const root = path.parse(dir).root;
      let depth = 0;

      while (dir !== root && depth < 20) {
        if (fs.existsSync(path.join(dir, 'tsconfig.json'))) break;
        dir = path.dirname(dir);
        depth++;
      }

      if (fs.existsSync(path.join(dir, 'tsconfig.json'))) {
        try {
          const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
          if (!pluginRoot) throw new Error('CLAUDE_PLUGIN_ROOT not set');

          const { findOrInstall } = require(path.join(pluginRoot, 'scripts', 'lib', 'binary-resolver'));
          const tscBin = findOrInstall('typescript', 'tsc');

          if (tscBin) {
            try {
              execFileSync(tscBin, ['--noEmit', '--pretty', 'false'], {
                cwd: dir,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 30000,
              });
            } catch (err) {
              // tsc exits non-zero on type errors — filter to edited file only
              const output = (err.stdout || '') + (err.stderr || '');
              const relPath = path.relative(dir, resolvedPath);
              const candidates = new Set([filePath, resolvedPath, relPath]);
              const relevantLines = output
                .split('\n')
                .filter(line => {
                  for (const candidate of candidates) {
                    if (line.includes(candidate)) return true;
                  }
                  return false;
                })
                .slice(0, 10);

              if (relevantLines.length > 0) {
                console.error('[Hook] TypeScript errors in ' + path.basename(filePath) + ':');
                relevantLines.forEach(line => console.error(line));
              }
            }
          }
        } catch {
          // Binary not available — non-blocking
        }
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
