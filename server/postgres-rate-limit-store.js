export class PostgresRateLimitStore {
  constructor(pool, namespace) {
    this.pool = pool
    this.namespace = namespace
    this.windowMs = 60_000
    this.prefix = `${namespace}:`
    this.nextCleanupAt = 0
  }

  init(options) {
    this.windowMs = options.windowMs
  }

  async increment(key) {
    if (Date.now() >= this.nextCleanupAt) {
      await this.pool.query(
        `DELETE FROM api_rate_limit_hits
         WHERE left(scope_key, length($1)) = $1
           AND window_start < NOW() - INTERVAL '1 day'`,
        [this.prefix],
      )
      this.nextCleanupAt = Date.now() + 60 * 60 * 1000
    }
    const result = await this.pool.query(
      `WITH bucket AS (
         SELECT to_timestamp(
           floor(extract(epoch FROM clock_timestamp()) * 1000 / $2) * $2 / 1000.0
         ) AS window_start
       )
       INSERT INTO api_rate_limit_hits (scope_key, window_start, hits)
       SELECT $1, bucket.window_start, 1 FROM bucket
       ON CONFLICT (scope_key, window_start)
       DO UPDATE SET hits = api_rate_limit_hits.hits + 1
       RETURNING hits,
         window_start + ($2::double precision * INTERVAL '1 millisecond') AS reset_time`,
      [`${this.prefix}${key}`, this.windowMs],
    )
    return {
      totalHits: Number(result.rows[0].hits),
      resetTime: new Date(result.rows[0].reset_time),
    }
  }

  async decrement(key) {
    await this.pool.query(
      `WITH bucket AS (
         SELECT to_timestamp(
           floor(extract(epoch FROM clock_timestamp()) * 1000 / $2) * $2 / 1000.0
         ) AS window_start
       )
       UPDATE api_rate_limit_hits hits
       SET hits = GREATEST(hits.hits - 1, 0)
       FROM bucket
       WHERE hits.scope_key = $1 AND hits.window_start = bucket.window_start`,
      [`${this.prefix}${key}`, this.windowMs],
    )
  }

  async resetKey(key) {
    await this.pool.query(
      `WITH bucket AS (
         SELECT to_timestamp(
           floor(extract(epoch FROM clock_timestamp()) * 1000 / $2) * $2 / 1000.0
         ) AS window_start
       )
       DELETE FROM api_rate_limit_hits hits
       USING bucket
       WHERE hits.scope_key = $1 AND hits.window_start = bucket.window_start`,
      [`${this.prefix}${key}`, this.windowMs],
    )
  }

  async resetAll() {
    await this.pool.query(
      "DELETE FROM api_rate_limit_hits WHERE left(scope_key, length($1)) = $1",
      [this.prefix],
    )
  }
}
