---
name: code-standards
description: Enforce this project's engineering standards on any code change — docs stay in sync with code, components are decomposed (≤500 lines each), and every component has tests. Invoke before finishing any task that adds or modifies code (creating/editing files under src/ or server/, adding features, refactoring). Also use to audit existing files against these standards.
---

# Code Standards

This skill enforces three non-negotiable standards on every code change in this
repo. Treat them as a checklist that must pass before any code task is "done".

When invoked, apply the relevant rules below to the code you just wrote or are
about to finish. If you are auditing rather than editing, report each violation
with its file path and line count.

## Rule 1 — Docs stay in sync with code

Whenever code changes, the docs that describe it must change in the same task.

- If a public API, prop, exported function signature, config option, CLI flag,
  env var, or data model changes, update its documentation.
- Update [README.md](../../../README.md) when setup, scripts, or top-level
  behavior changes. Update or create a `CLAUDE.md` / `docs/` entry when
  architecture or a subsystem changes.
- A new component or module gets a short doc block (header comment or doc page)
  describing its purpose, inputs, and outputs.
- Never leave docs describing behavior the code no longer has. If you can't find
  docs for what you changed, say so and propose where they should live.

**Check:** Did this change alter anything a reader of the docs would now find
wrong or missing? If yes, the docs are not done.

## Rule 2 — Components are decomposed (≤500 lines)

No single component/module file exceeds **500 lines**.

- Before finishing, count lines on every file you touched:
  `wc -l <file>`. For a sweep: `find src server -name '*.ts*' | xargs wc -l | sort -rn | head`.
- If a file is over 500 lines (or trending past it), decompose it: extract
  hooks, sub-components, helpers, types, or pure functions into sibling files
  with a single clear responsibility each.
- Prefer extracting along seams that are independently testable. A 480-line file
  doing three things is worse than three 160-line files doing one thing each.
- Decomposition must preserve behavior. Don't change logic while splitting;
  do that in a separate step.

**Check:** `wc -l` on each touched file. Any result > 500 is a violation that
must be resolved (or explicitly flagged to the user with a reason) before done.

## Rule 3 — Every component is tested

Every component/module has tests covering its behavior.

- New code ships with tests in the same task. Changed behavior gets its tests
  updated or added.
- Test the public contract: rendered output / return values, edge cases, and
  error paths — not implementation details.
- Run the suite and confirm it passes before declaring done. Report the result
  honestly (pass/fail with output); never claim tested without running.

> NOTE: This repo has no test runner configured yet. If you are adding the first
> tests, set up **Vitest** (it pairs with the existing Vite setup) — add
> `vitest` + `@testing-library/react` to devDependencies, a `"test": "vitest"`
> script, and a `vitest` config — then write the tests. Confirm with the user
> before adding new tooling if the task didn't ask for it.

**Check:** Does each touched component have a corresponding test file
(`*.test.ts` / `*.test.tsx`) that exercises the change, and does the suite pass?

## Final gate

Before reporting a code task complete, confirm all three:

1. ☐ Docs updated for everything the change affects
2. ☐ No touched file exceeds 500 lines (`wc -l` verified)
3. ☐ Tests exist for the change and the suite passes

State the gate result to the user. If any item can't be met, say which and why
rather than silently skipping it.

## Maintaining this skill

This skill is meant to evolve. To add or change a standard:

- Edit this file (`.claude/skills/code-standards/SKILL.md`).
- Keep the structure: one `## Rule N` section per standard, each ending in a
  concrete **Check:** the agent can run or verify.
- Update the `description` frontmatter if the trigger conditions change, and
  update the **Final gate** checklist to match the rules.
- When a rule needs detail too long for this file, add a reference file in this
  directory (e.g. `decomposition-patterns.md`) and link it from the rule.

When the user asks to "add/update a standard" or "change the code-standards
skill", make the edit here directly.
