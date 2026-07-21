# Airflow worker image with Node 20 for `npm run embed:backfill` (Feature 002).
FROM apache/airflow:2.9.3-python3.11

USER root
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER airflow
