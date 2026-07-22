export type DependencyName = "database" | "redis";
export type DependencyState = "up" | "down";

export type ReadinessResult = {
  status: "ready" | "not_ready";
  checks: Record<DependencyName, DependencyState>;
};

export function summarizeReadiness(
  checks: Record<DependencyName, DependencyState>,
): ReadinessResult {
  return {
    status: Object.values(checks).every((state) => state === "up")
      ? "ready"
      : "not_ready",
    checks,
  };
}

export async function withinTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Operation timed out.")), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
