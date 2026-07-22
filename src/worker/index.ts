import { writeFile } from "node:fs/promises";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { getServerEnvironment } from "../lib/env";
import { FOUNDATION_QUEUE_NAME, type FoundationJob } from "../lib/queue";

const HEARTBEAT_PATH = "/tmp/worker-ready";
const HEARTBEAT_INTERVAL_MS = 15_000;

async function main() {
  const environment = getServerEnvironment();
  const connection = new Redis(environment.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on("error", () => {
    console.error(JSON.stringify({ level: "error", event: "redis_connection_error" }));
  });

  const worker = new Worker<FoundationJob>(
    FOUNDATION_QUEUE_NAME,
    async (job) => {
      console.info(
        JSON.stringify({
          level: "info",
          event: "foundation_job_processed",
          jobId: job.id,
        }),
      );
    },
    { connection, concurrency: 2 },
  );

  async function heartbeat() {
    await writeFile(HEARTBEAT_PATH, new Date().toISOString(), "utf8");
  }

  await heartbeat();
  const heartbeatTimer = setInterval(() => {
    void heartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  async function shutdown(signal: string) {
    console.info(JSON.stringify({ level: "info", event: "worker_shutdown", signal }));
    clearInterval(heartbeatTimer);
    await worker.close();
    await connection.quit();
    process.exit(0);
  }

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  console.info(JSON.stringify({ level: "info", event: "worker_ready" }));
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "worker_start_failed",
      message: error instanceof Error ? error.message : "Unknown startup error",
    }),
  );
  process.exit(1);
});
