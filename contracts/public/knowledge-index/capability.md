# Capability contract

## Platform guarantees

For a deployed configuration, this platform:

- is the **sole writer** to the configured Upstash Vector index;
- maintains disjoint deploy-sync and archive-backfill scopes (single-writer
  split);
- enforces backfill write budget `<` provider daily cap before any archive
  writes;
- resumes archive backfill from the last committed cursor after failure;
- uses deterministic vector ids and content hashes for idempotent retries;
- stores chunk metadata per `data-contract.md` without auth or user identity;
- exposes operator CLIs and an optional Airflow DAG for scheduled backfill.

## Producer responsibilities

The corpus producer (for example `agentic-foundation`) owns:

- MDX stubs under `content/posts/` and archive bodies under `data/unfolding-*`;
- site routing, authentication, and any retrieval or chat HTTP APIs;
- pointing `CORPUS_ROOT` at a checkout that contains the expected tree;
- coordinating MAJOR contract upgrades with this platform and read consumers.

The producer MUST NOT upsert into the shared index. Deploy hooks may invoke
`npm run embed:sync` from this platform's checkout with `CORPUS_ROOT` set.

## Non-capabilities

This platform does not:

- register, authenticate, or identify end users;
- expose `POST /api/knowledge/retrieve` or any product HTTP API;
- ship chat UI, answer composition, or generative synthesis;
- author or edit essay content in `content/` or `data/`;
- guarantee retrieval latency, rerank quality, or chat SLOs;
- run Pagefind, syndication, or site build pipelines;
- provide a query API — read consumers use Upstash directly per the data
  contract.

Read consumers that need gated retrieval MUST implement access control in their
own application boundary; the index itself is not an auth layer.
