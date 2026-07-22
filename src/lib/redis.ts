import Redis from "ioredis";
import { getServerEnvironment } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  readinessRedis: Redis | undefined;
};

export function getReadinessRedis() {
  if (!globalForRedis.readinessRedis) {
    const { REDIS_URL, HEALTH_CHECK_TIMEOUT_MS } = getServerEnvironment();
    globalForRedis.readinessRedis = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: HEALTH_CHECK_TIMEOUT_MS,
      commandTimeout: HEALTH_CHECK_TIMEOUT_MS,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    });
    globalForRedis.readinessRedis.on("error", () => {
      // Readiness reports availability without logging connection secrets.
    });
  }

  return globalForRedis.readinessRedis;
}
