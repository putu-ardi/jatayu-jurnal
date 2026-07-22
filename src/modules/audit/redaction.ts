const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(password|secret|token|cookie|authorization|credential|hash|privateStorageKey)/i;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 2_000;

export type AuditValue =
  | null
  | boolean
  | number
  | string
  | AuditValue[]
  | { [key: string]: AuditValue };

export function redactAuditValue(value: unknown, depth = 0): AuditValue {
  if (depth >= MAX_DEPTH) {
    return "[TRUNCATED]";
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}[TRUNCATED]`
      : value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactAuditValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactAuditValue(item, depth + 1),
      ]),
    );
  }

  return String(value);
}
