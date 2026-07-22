import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { getServerEnvironment } from "@/lib/env";
import {
  summarizeReadiness,
  withinTimeout,
  type DependencyState,
} from "@/lib/health";
import { getReadinessRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

async function checkDatabase(timeoutMs: number): Promise<DependencyState> {
  try {
    await withinTimeout(getDatabase().$queryRaw`SELECT 1`, timeoutMs);
    return "up";
  } catch {
    return "down";
  }
}

async function checkRedis(timeoutMs: number): Promise<DependencyState> {
  try {
    const redis = getReadinessRedis();
    if (redis.status === "wait") await withinTimeout(redis.connect(), timeoutMs);
    await withinTimeout(redis.ping(), timeoutMs);
    return "up";
  } catch {
    return "down";
  }
}

export async function GET() {
  const { APP_VERSION, HEALTH_CHECK_TIMEOUT_MS } = getServerEnvironment();
  const [database, redis] = await Promise.all([
    checkDatabase(HEALTH_CHECK_TIMEOUT_MS),
    checkRedis(HEALTH_CHECK_TIMEOUT_MS),
  ]);
  const readiness = summarizeReadiness({ database, redis });

  return NextResponse.json(
    {
      ...readiness,
      service: "ejls-web",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    },
    {
      status: readiness.status === "ready" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
