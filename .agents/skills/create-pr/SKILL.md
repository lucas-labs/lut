---
name: create-pr
description: MUST USE this skill when creating or editing Pull Requests.
disable-model-invocation: true
---

# Creating Pull Requests

## Rules

### The title

Use conventional commit format for the PR title. If in doubt, ask the user what type of change the PR title should be.
The following are the most common types of changes:

- `feat: ✨ {title}`
- `chore: 🧹 {title}`
- `fix: 🚑 {title}`
- `refactor: 🔨 {title}`
- `perf: 🐎 {title}`
- `revert: 🔙 {title}`
- `docs: 📝 {title}`
- `ci: 🔄 {title}`

Titles must be concise in english, lowercased, and MUST not exceed 50 characters. This will be used as commit message
when merging the PR.

### The description

Descriptions MUST be written in Argentine Spanish and use the following template.

```md
### El Problema

Descripción del problema de forma concisa y clara. 1 párrafo es ideal, 2 párrafos como máximo.

### La solución

Descripción de la solución de forma concisa y clara. 2 párrafos como máximo.

### Otros cambios

<!-- Esta sección es opcional, solo si el PR incluye cambios no relacionados al problema anteriormente descrito. En caso de no haber otros cambios, esta sección debe ser eliminada. Este comentario no debe incluirse en el PR. No usar esta sección para cambios relacionados al problema anterior -->

- Cambio 1
- Cambio 2
- ...

### Referencias

<!-- Sección opcional, si el PR fue hecho a partir de un issue, incluir instrucción esta sección y la instrucción de cierre "Closes: #XYZ" - Eliminar esta sección si el PR no cierra ningún issue -->

- Closes: #XYZ
- Closes: #ZYX
```

**CRITICAL**: DO NOT include any Trailer like "Created with Claude Code" or "Co-Authored-By" in the PR description.

