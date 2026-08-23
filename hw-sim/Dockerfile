# syntax=docker/dockerfile:1.7

# Build stage
FROM oven/bun:1 AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY src ./src

RUN env -i PATH="$PATH" HOME="$HOME" \
    bun build src/index.ts --compile --minify --outfile hw-sim

# Production image with slim image for tools
FROM debian:bookworm-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

WORKDIR /app
COPY --from=build --chown=app:app /app/hw-sim ./hw-sim

USER app
EXPOSE 1883 4000
ENV PORT=4000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["./hw-sim"]
