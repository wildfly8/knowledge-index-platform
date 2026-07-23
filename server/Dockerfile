# Query API image for GCP Cloud Run (Feature 003).
# TLS terminates at Cloud Run; container serves plain HTTP on PORT.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV KNOWLEDGE_PLATFORM_HOST=0.0.0.0
ENV PORT=8080
ENV TRANSFORMERS_CACHE=/app/models/transformers-cache

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY lib ./lib
COPY server ./server
COPY scripts ./scripts
COPY models/transformers-cache ./models/transformers-cache

EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
