# Specification Quality Checklist: Posts Vector Index

**Purpose**: Validate spec completeness before planning  
**Created**: 2026-07-12  
**Feature**: [spec.md](./spec.md)

## Content Quality

- [x] Summary states operator/write scope (no auth or retrieve API here)
- [x] Domain Mapping lists Knowledge entities only
- [x] User stories are testable with `npm test` / CLI dry-run
- [x] Success criteria measurable

## Requirement Completeness

- [x] FRs cover sync scope, manifest, single-writer split
- [x] Edge cases: pre-examined, year archives, large essays
- [x] Out of scope lists auth, chat, retrieve HTTP

## Quality Gates

- [x] `npm test` passes
- [x] `npm run validate` passes
- [x] Public contract documents deploy-sync writer

## Notes

- Read consumers pin `contracts/public/knowledge-index@1.0.0` for index shape.
