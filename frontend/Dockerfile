# syntax=docker/dockerfile:1.7

# Build stage
FROM oven/bun:1 AS build

ARG BACKEND_URL=http://backend:3000
ENV BACKEND_URL=$BACKEND_URL

WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY . .

RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

# Production image with slim image for tools
FROM debian:bookworm-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app
WORKDIR /app

COPY --from=build --chown=app:app /usr/local/bin/bun /usr/local/bin/bun
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:3000 || exit 1

CMD ["bun", "run", "server.js"]
