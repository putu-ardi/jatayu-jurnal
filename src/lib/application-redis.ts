import "server-only";

import Redis from "ioredis";
import { getServerEnvironment } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  applicationRedis: Redis | undefined;
};

export function getApplicationRedis() {
  if (!globalForRedis.applicationRedis) {
    const { REDIS_URL } = getServerEnvironment();
    globalForRedis.applicationRedis = new Redis(REDIS_URL, {
      lazyConnect: false,
      connectTimeout: 3_000,
      commandTimeout: 3_000,
      enableOfflineQueue: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    });
    globalForRedis.applicationRedis.on("error", () => {
      // Callers fail closed without logging connection credentials.
    });
  }

  return globalForRedis.applicationRedis;
}
