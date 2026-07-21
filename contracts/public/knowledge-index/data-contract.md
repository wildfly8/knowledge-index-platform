# Data contract

## Corpus location (read first)

**This repository does not contain `content/` or `data/`.** Every path in this
contract is relative to **`CORPUS_ROOT`** — the filesystem root of a **corpus
producer** checkout (for example `agentic-foundation`). This platform only
reads those paths at CLI runtime; it never authors essays.

| What | Where it lives |
|------|----------------|
| MDX stubs (`content/posts/...`) | Producer repo at `CORPUS_ROOT` |
| Archive bodies (`data/unfolding-*`) | Producer repo at `CORPUS_ROOT` |
| Index writer code, CLIs, Airflow | **This** repo (`knowledge-index-platform`) |
| Upstash vectors + manifests | Shared index (written only by this platform) |

Metadata field `essay_path` always uses the producer-relative stub path (e.g.
`content/posts/examined/foo.mdx`), never a path inside this repository.

## Vector identity

Chunk vectors use deterministic ids:

```text
{essay_slug_without_leading_slash_with_slashes_as_double_dash}#{chunk_index}
```

Example: essay slug `/posts/examined/example` chunk `2` → `posts--examined--example#2`.

Control vectors (not chunk ids):

| Vector id | Writer | Payload role |
|-----------|--------|----------------|
| `__manifest__` | deploy-sync | Deploy-scope manifest digest and file entries |
| `__backfill_manifest__` | archive-backfill | Archive backlog cursor and per-file progress |

Read consumers MUST treat ids as opaque except for the deterministic chunk
scheme above. Consumers MUST NOT upsert or delete chunk vectors — this platform
is the sole writer.

## Chunk metadata

Each chunk vector stores:

| Field | Type | Notes |
|-------|------|-------|
| `essay_path` | string | Stub path under `content/` (stable id anchor) |
| `essay_slug` | string | URL slug derived from stub path |
| `heading` | string \| null | Nearest heading when chunked |
| `chunk_index` | number | Zero-based ordinal within essay |
| `content_hash` | string | `sha256:` digest of normalized source text |
| `token_estimate` | number | Approximate token count |
| `text` | string | Snippet (bounded; full passage in vector `data`) |

Chunk payloads MUST NOT include auth material, user or session ids, API keys,
or other secrets. Read consumers remain responsible for not logging retrieved
text into telemetry.

Embedding model (write path): `Xenova/all-MiniLM-L6-v2` unless overridden by
`EMBED_MODEL`.

## Corpus paths

All paths below are **producer-checkout paths** — resolved as
`path.join(CORPUS_ROOT, <relative-path>)`. They do not exist in the
`knowledge-index-platform` repository tree.

### Deploy-sync scope

| Path pattern | Include | Notes |
|--------------|---------|-------|
| `content/posts/examined/**` | Yes | Primary corpus |
| `content/posts/unfolding/**` | Yes* | Excludes conversation year archives by default |
| `content/posts/pre-examined/**` | **No** | Purged on sync if present in index |
| `content/posts/unfolding/{chatgpt,gemini}(-20xx)?.mdx` | **No** (default) | Owned by archive backfill |
| `content/posts/**/_meta.ts` | No | Site navigation only |
| Binary / images / PDF | No | v1 — no OCR |

### Archive backfill scope

| Path pattern | Include | Body resolution |
|--------------|---------|-----------------|
| `content/posts/unfolding/chatgpt-20xx.mdx` | Yes | `data/unfolding-chatgpt/chatgpt-20xx.mdx` |
| `content/posts/unfolding/gemini-20xx.mdx` | Yes | `data/unfolding-gemini/gemini-20xx.mdx` |
| `content/posts/unfolding/chatgpt.mdx` | **No** | Index stub only |
| `content/posts/unfolding/chatgpt-20xx-pN.mdx` | **No** | ISR part stub; slices year archive |
| `content/posts/unfolding/activity-20xx.mdx` | **No** | Deploy-sync only (`data/unfolding-activity/`) |

**Stub vs body rule**: `essay_path` in metadata always references the `content/`
stub. Large archive bodies live under `data/unfolding-*` and are resolved at
index time. Vector ids and slugs are derived from the stub path so deploy-sync
and backfill share one id namespace without collision (disjoint file sets).

### Index read surface (Feature 003)

Read consumers call the **query HTTP API** (`POST /v1/retrieve`) rather than
embedding queries locally. The platform runs:

1. Query expansion (domain glossary).
2. Bi-encoder embed (`Xenova/all-MiniLM-L6-v2`).
3. Upstash ANN search; filter `pre-examined` paths.
4. Optional cross-encoder rerank (`Xenova/ms-marco-MiniLM-L-6-v2`).
5. Return ranked chunks per metadata schema above.

Auth and rate limits are **consumer-owned** at the app edge.

## Compatibility

- **MINOR**: backward-compatible metadata fields, new optional env vars, clearer
  documentation.
- **MAJOR**: vector id scheme change, control vector rename, single-writer split
  change, or breaking metadata field removal/rename.
- Re-embedding the corpus after a MAJOR bump is a coordinated migration between
  this platform and all read consumers.

Consumers may rely on `content_hash` for idempotent skip logic when comparing
manifest entries to live corpus state.
