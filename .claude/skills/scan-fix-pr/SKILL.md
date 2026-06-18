---
name: scan-fix-pr
description: Scan the codebase for a real bug/optimization/improvement, fix it on a type-named branch, verify, then commit and open a PR. Invoke when asked to "scan and fix", "find and fix an issue and open a PR", "find optimizations/bugs and branch them", or any request to autonomously triage a finding and deliver it as a reviewable pull request.
---

# Scan → Fix → PR

This skill turns a vague "find and fix something" request into a single,
reviewable pull request. The deliverable is always: **one isolated finding,
fixed on its own branch, verified, committed, pushed, and opened as a PR.**

Work the steps in order. Do not skip verification, and do not commit unrelated
working-tree changes.

## Step 1 — Establish a green baseline

- Read `package.json` scripts and run the test suite (`npm test` / `vitest run`)
  and typecheck (`npm run typecheck` / `tsc -b --noEmit`). Capture output to a
  file when runs are long.
- Record the result. If the baseline is already red, surface that to the user
  before doing anything else — don't build a fix on top of failing tests.
- `git status` first. **Note any pre-existing uncommitted changes** — they are
  not yours to commit. You will isolate your fix from them in Step 4.

## Step 2 — Find one concrete finding

- Hunt for a **real, verifiable** finding — not style nits. Categories:
  - `bug` — wrong logic, off-by-one, missing null/undefined guard that throws,
    bad comparator, swapped args, edge case producing wrong output, code that
    contradicts its own comments.
  - `optimization` — measurable waste: redundant work, O(n²) where O(n) fits,
    unnecessary re-renders/allocations.
  - `improvement` — correctness-adjacent robustness, consistency with an
    existing pattern in the repo, missing test coverage on a real path.
- For broad codebases, fan out parallel read-only `Explore` agents over distinct
  subsystems to surface candidates, then **personally verify** the top one by
  reading the actual code and constructing a concrete triggering input.
- Prefer findings that are unambiguous and low-risk over flashy-but-speculative
  ones. If a candidate might be intended behavior, set it aside or flag it
  separately rather than "fixing" it.
- If nothing solid turns up, say so honestly instead of inventing an issue.

## Step 3 — Create the branch (named by type)

Branch off `main` (or the repo's default branch), naming it by finding type:

```
<type>/<finding-title-here>
```

- `<type>` is one of `bug`, `optimization`, `improvement`.
- `<finding-title-here>` is a short kebab-case slug describing the finding.
- Examples:
  - `bug/duplicate-entity-missing-script-guard`
  - `optimization/dedupe-asset-manifest-scan`
  - `improvement/modeler-focus-lock-active-object`

```
git checkout main
git checkout -b <type>/<finding-title-here>
```

Pre-existing uncommitted changes follow into the new branch's working tree —
that's expected. You'll only stage your own files.

## Step 4 — Apply the fix and verify

- Make the minimal change that resolves the finding. Match the surrounding
  code's style and reuse existing patterns/helpers.
- Add or update a **regression test** that fails without the fix and passes with
  it. Prove it: temporarily revert the fix (e.g. `git stash push -- <file>`),
  run the test to confirm it fails, then restore.
- Run the relevant test file(s), the full suite if quick, and the typecheck.
  Report pass/fail honestly with output — never claim verified without running.
- This skill composes with **code-standards** — apply its docs/decomposition/
  test gates to the change before moving on.

## Step 5 — Commit only your files

- Stage **only** the files belonging to your finding:
  `git add <your-files>`. Never `git add -A`.
- Leave pre-existing WIP and build artifacts (e.g. `*.tsbuildinfo`) unstaged.
  Verify with `git status --short` that only your files are staged (`M ` in the
  left column).
- Commit with a message that names the finding and the fix:

```
<type>: <one-line summary>

<what was wrong, the concrete failure it caused, and how the fix resolves it>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

## Step 6 — Push and open the PR (final step)

This is the last step, and it is **not optional** — the task is not done at a
pushed branch. Always create the PR:

```
git push -u origin <type>/<finding-title-here>
gh pr create --base main --head <branch> --title "<type>: <summary>" --body "<body>"
```

- The PR body should include: **Summary** (the finding), **Fix**, and
  **Verification** (test + typecheck results).
- End the PR body with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- If `gh` is not authenticated (`gh auth status` fails / no `GH_TOKEN`), the
  branch is already pushed — tell the user to run `gh auth login` (or set
  `GH_TOKEN`), then run `gh pr create` for them once they confirm. Do not stop
  at the pushed branch and call it done.

## Final gate

Before reporting complete, confirm:

1. ☐ Baseline was green (or the user was told it wasn't)
2. ☐ Finding is real and verified with a concrete triggering input
3. ☐ Branch named `<type>/<slug>` off the default branch
4. ☐ Regression test proven to fail without the fix
5. ☐ Only your files committed; suite + typecheck pass
6. ☐ Branch pushed **and** PR opened (link reported to the user)

## Maintaining this skill

Edit this file (`.claude/skills/scan-fix-pr/SKILL.md`) to change the process.
Keep the step ordering and the **Final gate** checklist in sync with the steps.
