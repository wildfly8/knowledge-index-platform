# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

*Prerequisite: `spec.md` reviewed; `npm test` and `npm run validate` green.*

**Note**: Observable behavior changes MUST update `contracts/public/knowledge-index/` (semver + changelog) before implementation merges.

## Summary

[Technical approach — CLI, Airflow, Upstash, corpus paths]

## Technical Context

**Language/Version**: Node 20+, TypeScript

**Primary Dependencies**: `@upstash/vector`, `@xenova/transformers`

**Storage**: Upstash Vector (`__manifest__`, `__backfill_manifest__`)

**Testing**: `lib/knowledge/*.test.ts`; `npm test`

**Target Platform**: Operator CLI + optional Airflow Docker

**Corpus**: Producer checkout at `CORPUS_ROOT`

## Constitution Check

- [ ] `npm test` passed
- [ ] `npm run validate` passed (if public contract touched)
- [ ] Single-writer split preserved (Principle II)
- [ ] No auth/user/session scope introduced

## Domain Alignment

| Entity (from spec) | `data-model.md` section | Implementation | Contract |
|--------------------|---------------------------|----------------|----------|
| [Entity] | [§] | `lib/knowledge/...` | public contract or internal redirect |

## Project Structure

```text
specs/[###-feature]/
contracts/          # internal redirects → contracts/public/
lib/knowledge/
scripts/embed-posts/
```

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design

- [data-model.md](./data-model.md)
- [contracts/](./contracts/) — redirect stubs only; normative text in `contracts/public/`

## Phase 2: Tasks

See [tasks.md](./tasks.md) via `/speckit-tasks`.
