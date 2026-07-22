import { z } from "zod";

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_VERSION: z.string().trim().min(1).default("0.1.0"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  REDIS_URL: z.url().startsWith("redis://"),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(3_000),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  if (source === process.env && cachedEnvironment) {
    return cachedEnvironment;
  }

  const environment = serverEnvironmentSchema.parse(source);

  if (source === process.env) {
    cachedEnvironment = environment;
  }

  return environment;
}

export function resetEnvironmentCacheForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Environment cache can only be reset while testing.");
  }

  cachedEnvironment = undefined;
}
