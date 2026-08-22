/**
 * Tracks the time since the last successful fetch for a single upstream
 * GTFS-RT feed and reports whether it has exceeded a staleness threshold.
 * A feed that has never succeeded is stale by definition.
 */
export class FeedTracker {
  private lastSuccessAt: number | null = null

  constructor(
    private readonly thresholdMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  recordSuccess(): void {
    this.lastSuccessAt = this.now()
  }

  get stale(): boolean {
    if (this.lastSuccessAt === null) return true
    return this.now() - this.lastSuccessAt > this.thresholdMs
  }
}
