# Vector retrieval (internal redirect)

> **Not a published contract.** This platform does not implement retrieval HTTP
> APIs or user sessions. Read consumers pin the public data contract:
> [`contracts/public/knowledge-index`](../../../contracts/public/knowledge-index/README.md)
> @ **`1.0.0`**.

Index read surface (metadata schema, corpus path rules, consumer rerank flow)
is documented in
[data-contract.md § Index read surface](../../../contracts/public/knowledge-index/data-contract.md).

Authentication, rate limits, and chat UI are **consumer-owned** (for example
the corpus producer application). This repository writes vectors only.
