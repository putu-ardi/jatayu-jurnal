import "server-only";

import { headers } from "next/headers";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function hostnameFromHostHeader(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized.startsWith("[")
    ? normalized.slice(1, normalized.indexOf("]"))
    : normalized.split(":", 1)[0];
}

export async function shouldUseSecureCookies() {
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",", 1)[0];
  const hostname = hostnameFromHostHeader(forwardedHost ?? requestHeaders.get("host") ?? "");

  if (forwardedProto === "https") {
    return true;
  }
  if (forwardedProto === "http") {
    return !isLoopbackHostname(hostname);
  }

  return process.env.NODE_ENV === "production" && !isLoopbackHostname(hostname);
}
