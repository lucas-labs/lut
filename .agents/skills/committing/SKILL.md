---
name: committing
description: "MUST ALWAYS USE for committing code changes to git repos."
---

# Committing

<important>

**IMPORTANT/CRITICAL**: If you're about to commit: STOP unless the user explicitly asked you to do so. Prior
authorization on a different change diff, does not imply ALL commits are authorized. If you decided to commit all by
yourself, STOP IMMEDIATELY. NEVER commit if the user did not explicitly ask you to do so for the current specific change
diff. If you are unsure, ask the user for clarification. DO NOT make assumptions.

</important>

## Message Format

- Write conventional commits: `<type>: <emoji> <what changed>` (e.g.`feat: ✨ …`, `chore: 🧹 …`,
  `docs: 📝 …`).
- Commit messages MUST be in English
- Commit titles MUST be **less than 70 characters** (including the type and emoji).
- Commit bodies MUST be **less than 100 characters per line** and MUST have less than 4 lines: include a brief description
  of the change, not a detailed explanation or a per-file breakdown.
- If the commit is related to a specific project issue / ticket / task, include the reference in the trailer e.g.
  `Ref: EPIC-XYZ`.
- **NEVER include a `Co-Authored-By` trailer** (clarification).
- Use ALL LOWERCASE letters in the commit message.
- you can use scopes in the commit message, but there's only 2 scopes allowed:
  - ui (frontend)
  - be (backend)
  e.g. `feat(ui): ✨ …` or `fix(be): 🚑 …`

**Valid commit type emojis**:

- i18n: 🌐
- style: 💄
- revert: 🔙
- release: 🔖
- chore: 🧹
- refactor: 🔨
- feat: ✨
- fix: 🚑
- ci: 🔄
- perf: 🐎
- docs: 📝
- test: 🧪
- wip: 🚧

NEVER add `Co-Authored-By` trailers to commit messages.
