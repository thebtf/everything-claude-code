---
name: verification-loop
description: "A comprehensive verification system for Claude Code sessions."
---

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

### Phase 1: Build Verification
```bash
# Check if project builds (Unix/macOS)
npm run build 2>&1 | tail -20
# OR
pnpm build 2>&1 | tail -20

# Windows PowerShell equivalent
# npm run build 2>&1 | Select-Object -Last 20
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
# TypeScript projects (Unix/macOS)
npx tsc --noEmit 2>&1 | head -30

# Python projects (Unix/macOS)
pyright . 2>&1 | head -30

# Windows PowerShell equivalent
# npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check
```bash
# JavaScript/TypeScript (Unix/macOS)
npm run lint 2>&1 | head -30

# Python (Unix/macOS)
ruff check . 2>&1 | head -30

# Windows PowerShell equivalent
# npm run lint 2>&1 | Select-Object -First 30
```

### Phase 4: Test Suite
```bash
# Run tests with coverage (Unix/macOS)
npm run test -- --coverage 2>&1 | tail -50
# Windows PowerShell: npm run test -- --coverage 2>&1 | Select-Object -Last 50

# Check coverage threshold
# Target: 80% minimum
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan
```bash
# Check for secrets (Unix/macOS)
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# Check for console.log (Unix/macOS)
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10

# Windows PowerShell equivalents
# Select-String -Recurse -Pattern "sk-" -Include "*.ts","*.js" | Select-Object -First 10
# Select-String -Recurse -Pattern "api_key" -Include "*.ts","*.js" | Select-Object -First 10
# Select-String -Recurse -Pattern "console.log" -Include "*.ts","*.tsx" -Path src/ | Select-Object -First 10
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run: /verify
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
