# syntax=docker/dockerfile:1.7

# Build stage
FROM oven/bun:1 AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY proto ./proto
COPY src ./src
COPY scripts ./scripts
RUN bun run proto && rm -rf proto

RUN env -i PATH="$PATH" HOME="$HOME" \
    bun build src/index.ts --compile --minify --outfile server
# Compiled the same way as the server itself, so the fleet CronJob can run
# this as a standalone binary on the same image (no bun runtime or source
# tree needed in the final stage) — see openspec/changes/ramp-vehicle-accessibility.
RUN env -i PATH="$PATH" HOME="$HOME" \
    bun build scripts/refresh-accessibility.ts --compile --minify --outfile refresh-accessibility

# Production image with slim image for tools
FROM debian:bookworm-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

WORKDIR /app
COPY --from=build --chown=app:app /app/server ./server
# Same image, alternate entrypoint: the fleet CronJob runs this binary
# instead of ./server to refresh the accessibility dataset in place — see
# openspec/changes/ramp-vehicle-accessibility.
COPY --from=build --chown=app:app /app/refresh-accessibility ./refresh-accessibility
RUN mkdir -p /app/data && chown app:app /app/data
# Bootstrap-only default so a fresh deploy never starts from zero data: not
# the ongoing refresh path (that's the fleet CronJob writing to a mounted
# volume at this same path, which shadows this file once it lands).
COPY --chown=app:app src/gtfs/vehicle-accessibility.seed.json ./data/vehicle-accessibility.json

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["./server"]
