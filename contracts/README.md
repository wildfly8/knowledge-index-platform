# Published contracts

`contracts/public/` is the only normative surface published for external
applications. Corpus-host and retrieval-consumer applications (contract
*consumers*) MUST pin a released semantic version of the
`contracts/public/knowledge-index` package and MUST NOT import this
repository's `specs/`, `lib/`, `scripts/`, `airflow/`, or internal workflows.

## Available contracts

- [`knowledge-index`](public/knowledge-index/README.md) — vector index write
  paths, chunk metadata, corpus conventions, CLI operations, and platform
  capabilities for the shared Upstash Vector index.

Each contract package contains a `VERSION` and `CHANGELOG.md`. Until a contract
registry is introduced, a release is identified by the repository tag
`contracts/<contract-name>/v<version>`. Consumers should resolve a tag rather
than copy files from a mutable branch.

The platform may change internal implementation without a public contract
release when externally observable behavior remains compatible.

## Terminology

- **Corpus producer**: an application that authors MDX stubs under `content/`
  and archive bodies under `data/` (for example `agentic-foundation`).
- **Index platform**: this repository — the sole writer to the shared Upstash
  Vector index.
- **Read consumer**: an application that queries the index (for example a chat
  app). Read consumers MUST honor the public data contract; auth and UI are
  consumer-owned.
- **Contract consumer**: any service that pins a released version of a contract
  published here.
