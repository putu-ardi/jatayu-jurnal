import { z } from "zod";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
const GOOGLE_LINK_CALLBACK_PATH = "/api/auth/google/link/callback";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalHostedDomain = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).optional(),
);

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_VERSION: z.string().trim().min(1).default("0.1.0"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  REDIS_URL: z.url().startsWith("redis://"),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(3_000),
  GOOGLE_OIDC_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GOOGLE_OIDC_ISSUER: optionalSecret,
  GOOGLE_OIDC_CLIENT_ID: optionalSecret,
  GOOGLE_OIDC_CLIENT_SECRET: optionalSecret,
  GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: optionalHostedDomain,
  GOOGLE_OIDC_REDIRECT_URI: optionalSecret,
  GOOGLE_OIDC_LINK_REDIRECT_URI: optionalSecret,
  GOOGLE_OIDC_SCHOOL_CODE: optionalSecret,
}).superRefine((environment, context) => {
  if (!environment.GOOGLE_OIDC_ENABLED) {
    return;
  }

  const requiredKeys = [
    "GOOGLE_OIDC_ISSUER",
    "GOOGLE_OIDC_CLIENT_ID",
    "GOOGLE_OIDC_CLIENT_SECRET",
    "GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN",
    "GOOGLE_OIDC_REDIRECT_URI",
    "GOOGLE_OIDC_LINK_REDIRECT_URI",
    "GOOGLE_OIDC_SCHOOL_CODE",
  ] as const;
  for (const key of requiredKeys) {
    if (!environment[key]) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required when Google OIDC is enabled.`,
      });
    }
  }

  if (environment.GOOGLE_OIDC_ISSUER && environment.GOOGLE_OIDC_ISSUER !== GOOGLE_ISSUER) {
    context.addIssue({
      code: "custom",
      path: ["GOOGLE_OIDC_ISSUER"],
      message: `Google OIDC issuer must be ${GOOGLE_ISSUER}.`,
    });
  }

  for (const [key, expectedPath] of [
    ["GOOGLE_OIDC_REDIRECT_URI", GOOGLE_CALLBACK_PATH],
    ["GOOGLE_OIDC_LINK_REDIRECT_URI", GOOGLE_LINK_CALLBACK_PATH],
  ] as const) {
    const redirectUriValue = environment[key];
    if (!redirectUriValue) continue;
    try {
      const redirectUri = new URL(redirectUriValue);
      const isLoopbackHttp =
        redirectUri.protocol === "http:" &&
        LOOPBACK_HOSTNAMES.has(redirectUri.hostname.toLowerCase());
      const isSecureHttps = redirectUri.protocol === "https:";
      if (
        (!isSecureHttps && !isLoopbackHttp) ||
        redirectUri.username ||
        redirectUri.password ||
        redirectUri.pathname !== expectedPath ||
        redirectUri.search ||
        redirectUri.hash
      ) {
        throw new Error("Invalid Google callback URL.");
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `Google OIDC redirect URI must use HTTPS, or HTTP on a loopback host for local testing, and end exactly in ${expectedPath}.`,
      });
    }
  }
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
