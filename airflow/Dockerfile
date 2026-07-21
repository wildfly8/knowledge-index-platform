# Airflow worker image with Node 20 for `npm run embed:backfill` (Feature 002).
FROM apache/airflow:2.9.3-python3.11

USER root
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint.sh /docker-entrypoint-knowledge.sh
RUN chmod +x /docker-entrypoint-knowledge.sh \
    && mkdir -p /opt/airflow/xenova-cache \
    && chown -R airflow:root /opt/airflow/xenova-cache

ENTRYPOINT ["/docker-entrypoint-knowledge.sh"]
CMD ["standalone"]
