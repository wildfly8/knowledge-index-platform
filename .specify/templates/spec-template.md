# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## Summary

- **What this feature delivers**: [one sentence]
- **Surface type**: [CLI / Airflow operator / public contract amendment]
- **Who it affects**: [operators, read consumers, corpus producers]
- **Public contract**: [link to `contracts/public/knowledge-index/` if behavior is externally visible]
- **Works with other features**: [plain-language dependencies]
- **Must not break**: [single-writer split, budget rules, public contract semver]

*Spec changes are reviewed editorially. Run `npm test` and `npm run validate` before `/speckit-plan` (constitution Quality Gates).*

## Domain Mapping

**Primary bounded context**: Knowledge

| Entity | Role in this feature | Owner context |
|--------|----------------------|---------------|
| [Entity name] | [created / extended / referenced] | [context] |

**Cross-feature dependencies**:

| Feature / external | Relationship | Contract / SSOT |
|--------------------|--------------|-----------------|
| [001 / 002 / producer] | [extends / orthogonal] | [public contract path] |

**Invariants** (`INV-EMBED-*`, `INV-BACKFILL-*`):

- **[INV-…]**: [statement]

## Saga and state machines

[Process states and edge table when multi-step]

## User Scenarios & Testing

### User Story 1 - [Title] (Priority: P1)

[Scenarios]

## Requirements

### Functional Requirements

- **FR-001**: [requirement]

## Success Criteria

- **SC-001**: [measurable outcome]

## Assumptions

## Out of Scope

- User registration, authentication, chat UI, or retrieve HTTP APIs (read-consumer scope unless this feature explicitly owns a public contract surface).
