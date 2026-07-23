#!/usr/bin/env bash
# Chown Xenova cache for the airflow task user, then hand off to the stock entrypoint.
set -euo pipefail

CACHE_DIR="${TRANSFORMERS_CACHE:-/opt/airflow/xenova-cache}"
mkdir -p "${CACHE_DIR}"
# PVC / restricted mounts may reject chown; ignore (fsGroup or prior chown on volume).
chown -R airflow:root "${CACHE_DIR}" 2>/dev/null || true

# Persisted /opt/airflow volume can leave stale webserver pid files after recreate.
rm -f /opt/airflow/airflow-webserver.pid /opt/airflow/airflow-webserver-monitor.pid

exec /entrypoint "$@"
