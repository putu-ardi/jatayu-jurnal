export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("Authorization denied");
    this.name = "AuthorizationDeniedError";
  }
}

export class ConflictError extends Error {
  constructor() {
    super("Data changed by another request");
    this.name = "ConflictError";
  }
}

const conflictCodes = new Set(["P2002", "P2034", "23P01", "40001", "40P01"]);

export function isConcurrencyConflict(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<object>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string" && conflictCodes.has(record.code)) {
      return true;
    }
    current = record.cause;
  }

  return false;
}
