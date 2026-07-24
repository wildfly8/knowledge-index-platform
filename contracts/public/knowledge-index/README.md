# knowledge-index public contract

**Contract**: `knowledge-index`  
**Version**: `4.0.0`  
**Publisher**: `knowledge-index-platform`

Normative external surface for the shared Upstash Vector semantic index. This
package is the only contract consumers may pin. Internal feature specs under
`specs/` are not published contracts.

## Package index

| File | Role |
|------|------|
| [api-contract.md](./api-contract.md) | CLI operations, environment, failure behavior |
| [data-contract.md](./data-contract.md) | Vector ids, chunk metadata, corpus paths |
| [capability.md](./capability.md) | Platform guarantees and non-capabilities |
| [contract.yaml](./contract.yaml) | Machine-readable manifest |
| [CHANGELOG.md](./CHANGELOG.md) | Semver history |
| [VERSION](./VERSION) | Current semver |

## Release

Published release tag: `contracts/knowledge-index/v4.0.0`

Pin as: `contracts/public/knowledge-index@4.0.0`

## Consumer rule

Consumers MUST NOT depend on `specs/`, `lib/`, `scripts/`, or `airflow/` in
this repository. Amendments to observable behavior require a semver bump here
before producers or read consumers upgrade.
