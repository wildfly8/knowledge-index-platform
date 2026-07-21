# Specification Quality Checklist: Archive Embedding Backfill

**Purpose**: Validate spec completeness before planning  
**Created**: 2026-07-17  
**Feature**: [spec.md](./spec.md)

## Content Quality

- [x] Summary states CLI/Airflow operator scope
- [x] Year-archive path scope explicit (stubs vs `data/` bodies)
- [x] Budget and resume stories testable

## Requirement Completeness

- [x] FRs cover scan scope, budget fail-closed, manifest, BF07/BF08
- [x] INV-BACKFILL-003 single-writer split documented
- [x] Out of scope: auth, chat, index stubs, ISR parts

## Quality Gates

- [x] `npm test` passes (saga + budget + scan tests)
- [x] `npm run validate` passes
- [x] Public contract documents archive-backfill writer and corpus paths

## Notes

- `CORPUS_ROOT` must point at producer checkout with `data/unfolding-*` trees.
