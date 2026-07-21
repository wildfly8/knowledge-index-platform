# Changelog

## 3.0.0

- **MINOR** (additive): `POST /v1/chat` — retrieve + extractive/generative answer
  composition on the platform (Feature 003).
- `POST /v1/warm` may preload generator ONNX when `GENERATOR_SYNTHESIZE=true`.
- Query/retrieve surfaces from 2.0.0 unchanged.

## 2.0.0

- **MAJOR** (additive): Query HTTP API (Feature 003) — `POST /v1/retrieve`,
  `GET /v1/status`, `POST /v1/warm`, `GET /health`.
- Documents bearer auth (`KNOWLEDGE_RETRIEVE_API_SECRET`) and two-stage
  retrieve pipeline (bi-encoder ANN + cross-encoder rerank).
- CLI write surfaces unchanged from 1.0.0.

## 1.0.0

- Initial publication of the standalone knowledge-index platform contract.
- Documents deploy sync (`__manifest__`), archive backfill (`__backfill_manifest__`),
  single-writer scope split, vector id scheme, chunk metadata, and corpus path
  resolution (`content/` stubs → `data/` bodies).
- Retrieval, authentication, and chat UI are explicitly out of scope for this
  publisher; read consumers pin this data contract when querying the index.
