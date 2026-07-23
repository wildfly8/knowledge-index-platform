{{- define "platform-local.podTemplate" -}}
apiVersion: v1
kind: Pod
metadata:
  labels:
    feature: knowledge-index-backfill
spec:
  securityContext:
    fsGroup: 50000
  restartPolicy: Never
  containers:
    - name: base
      image: {{ .Values.worker.image }}
      imagePullPolicy: IfNotPresent
      env:
        - name: AIRFLOW__LOGGING__BASE_LOG_FOLDER
          value: /opt/airflow/shared-logs
        - name: KNOWLEDGE_INDEX_REPO
          value: /opt/knowledge-index-platform
        - name: CORPUS_ROOT
          value: /opt/agentic-foundation
        - name: AGENTIC_FOUNDATION_REPO
          value: /opt/agentic-foundation
        - name: TRANSFORMERS_CACHE
          value: /opt/airflow/xenova-cache
        - name: KNOWLEDGE_INFERENCE_WORKER
          value: "0"
        - name: UPSTASH_DAILY_WRITE_CAP
          value: "10000"
        - name: EMBED_BACKFILL_WRITE_BUDGET
          value: "9500"
        - name: AIRFLOW__DATABASE__SQL_ALCHEMY_CONN
          valueFrom:
            secretKeyRef:
              name: knowledge-airflow-metadata
              key: connection
      envFrom:
        - secretRef:
            name: knowledge-index-secrets
      resources:
        requests:
          cpu: {{ .Values.worker.resources.requests.cpu | quote }}
          memory: {{ .Values.worker.resources.requests.memory }}
        limits:
          cpu: {{ .Values.worker.resources.limits.cpu | quote }}
          memory: {{ .Values.worker.resources.limits.memory }}
      volumeMounts:
        - name: platform-repo
          mountPath: /opt/knowledge-index-platform
        - name: corpus
          mountPath: /opt/agentic-foundation
          readOnly: true
        - name: node-modules
          mountPath: /opt/knowledge-index-platform/node_modules
        - name: xenova-cache
          mountPath: /opt/airflow/xenova-cache
        - name: dags-host
          mountPath: /opt/airflow/dags
          readOnly: true
        - name: airflow-logs
          mountPath: /opt/airflow/shared-logs
        - name: airflow-config
          mountPath: /opt/airflow/airflow.cfg
          subPath: airflow.cfg
          readOnly: true
  initContainers:
    - name: npm-ci
      image: {{ .Values.worker.image }}
      imagePullPolicy: IfNotPresent
      command:
        - bash
        - -lc
        - |
          if [ ! -f /opt/knowledge-index-platform/node_modules/.package-lock.json ]; then
            cd /opt/knowledge-index-platform && npm ci
          fi
      volumeMounts:
        - name: platform-repo
          mountPath: /opt/knowledge-index-platform
        - name: node-modules
          mountPath: /opt/knowledge-index-platform/node_modules
  volumes:
    - name: platform-repo
      hostPath:
        path: {{ .Values.hostPaths.platform }}
        type: Directory
    - name: corpus
      hostPath:
        path: {{ .Values.hostPaths.corpus }}
        type: Directory
    - name: node-modules
      emptyDir: {}
    - name: xenova-cache
      persistentVolumeClaim:
        claimName: xenova-cache
    - name: dags-host
      hostPath:
        path: {{ .Values.hostPaths.dags }}
        type: Directory
    - name: airflow-logs
      hostPath:
        path: {{ .Values.hostPaths.logs }}
        type: DirectoryOrCreate
    - name: airflow-config
      configMap:
        name: knowledge-airflow-config
{{- end -}}
