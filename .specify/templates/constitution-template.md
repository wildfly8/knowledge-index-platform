# [PROJECT_NAME] Constitution

## Core Principles

### I. Spec-First Delivery
[PRINCIPLE_1_DESCRIPTION]

### II. Single-Writer Index Split (NON-NEGOTIABLE)
[PRINCIPLE_2_DESCRIPTION]

### III. Federated Public Contracts
`contracts/public/` is the only normative surface for external consumers.
Packages carry semver `VERSION`, changelog, and `api` / `data` / `capability`
surfaces. Internal `specs/**/contracts/` are redirects only.

### IV. [Additional principles…]

## Quality Gates

| Stage | Command |
|-------|---------|
| Public contract | `npm run validate` |
| Unit tests | `npm test` |
| Sync dry-run | `npm run embed:sync -- --dry-run` |
| Backfill dry-run | `npm run embed:backfill -- --dry-run` |

## Governance

**Artifact precedence**: constitution → `contracts/public/` → `specs/NNN-*/spec.md` → plan → code.

This repository has **no** `domain:*` compiler. Do not reference `domain:extract` or `domain:check` in gates.

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
