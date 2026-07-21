"""Budgeted daily archive embedding backfill (Feature 002, SAGA-BACKFILL-001).

Thin orchestration wrapper around `npm run embed:backfill` — the CLI owns all
correctness (budget arithmetic, cursor commits, saga transitions, retries at
the micro-batch level). The DAG adds schedule, task-level retries, and
operator UX only (research.md Decision 5).

Schedule: 01:00 UTC daily — comfortably after the Upstash free-tier daily
write-quota reset (00:00 UTC), so each run sees a full budget.

Trigger params (dag_run.conf):
  {"dry_run": true}                          — plan only, zero writes
  {"essay_paths": ["content/posts/unfolding/chatgpt-2023.mdx"]}  — scoped run
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

REPO_DIR = os.environ.get(
    "KNOWLEDGE_INDEX_REPO", "/opt/knowledge-index-platform"
)
# Corpus for content/ + data/ (producer checkout); CLI also reads CORPUS_ROOT.
CORPUS_ROOT = os.environ.get("CORPUS_ROOT") or os.environ.get(
    "AGENTIC_FOUNDATION_REPO", "/opt/agentic-foundation"
)

# Jinja fragments that expand dag_run.conf into CLI flags.
ESSAY_PATH_FLAGS = (
    "{% for p in (dag_run.conf.get('essay_paths') or []) %}"
    " --essay-path {{ p }}"
    "{% endfor %}"
)
DRY_RUN_FLAG = "{{ ' --dry-run' if dag_run.conf.get('dry_run') else '' }}"

default_args = {
    "owner": "knowledge",
    "depends_on_past": False,
    "retries": 0,
}

with DAG(
    dag_id="embed_archive_backfill",
    description="Drain ChatGPT/Gemini archive embeddings into Upstash within the daily write budget",
    schedule="0 1 * * *",
    start_date=datetime(2026, 7, 1),
    catchup=False,
    max_active_runs=1,
    default_args=default_args,
    tags=["knowledge", "feature-002"],
) as dag:
    # FR-012 fail-closed: exits non-zero when budget >= provider cap or the
    # single-writer split is violated, before any provider write.
    validate_budget = BashOperator(
        task_id="validate_budget",
        bash_command=f"cd {REPO_DIR} && npm run embed:backfill -- --dry-run" + ESSAY_PATH_FLAGS,
    )

    # Logs the day's plan (new / resume / changed / removed per archive).
    scan_and_plan = BashOperator(
        task_id="scan_and_plan",
        bash_command=f"cd {REPO_DIR} && npm run embed:backfill -- --dry-run" + ESSAY_PATH_FLAGS,
    )

    # The real budgeted batch (BF01→BF02→BF03/BF04; BF05/BF06 on failure).
    # Airflow retries re-invoke the CLI, which resumes from the last committed
    # cursor — idempotent by vector-id, so retries never duplicate (INV-BACKFILL-002).
    run_budgeted_batch = BashOperator(
        task_id="run_budgeted_batch",
        bash_command=(
            f"cd {REPO_DIR} && npm run embed:backfill -- --trigger daily_schedule"
            + DRY_RUN_FLAG
            + ESSAY_PATH_FLAGS
        ),
        retries=3,
        retry_delay=timedelta(minutes=5),
        retry_exponential_backoff=True,
        max_retry_delay=timedelta(minutes=30),
        execution_timeout=timedelta(hours=4),
    )

    # SC-003 reconciliation: sampled vector fetches vs manifest cursors (read-only).
    finalize_run_record = BashOperator(
        task_id="finalize_run_record",
        bash_command=f"cd {REPO_DIR} && npm run embed:backfill -- --verify",
    )

    validate_budget >> scan_and_plan >> run_budgeted_batch >> finalize_run_record
