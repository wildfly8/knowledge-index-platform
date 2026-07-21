# Changelog

## 1.0.0

- Initial publication of the standalone knowledge-index platform contract.
- Documents deploy sync (`__manifest__`), archive backfill (`__backfill_manifest__`),
  single-writer scope split, vector id scheme, chunk metadata, and corpus path
  resolution (`content/` stubs → `data/` bodies).
- Retrieval, authentication, and chat UI are explicitly out of scope for this
  publisher; read consumers pin this data contract when querying the index.
