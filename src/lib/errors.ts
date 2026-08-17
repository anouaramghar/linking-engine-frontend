interface ApiErrorShape {
  response?: { status?: number; data?: { detail?: unknown } };
}

/**
 * A 409 means the publication worker got there first. It is a settled outcome,
 * not a transient failure — callers must not invite a retry that would fail the
 * same way every time.
 */
export const isConflict = (error: unknown) =>
  (error as ApiErrorShape | null)?.response?.status === 409;

/** A resource may disappear because the user just completed its last action. */
export const isNotFound = (error: unknown) =>
  (error as ApiErrorShape | null)?.response?.status === 404;

/**
 * Pull a human-readable reason out of an API failure. FastAPI returns a string
 * `detail` for handled errors but an array of objects for schema violations, so
 * anything that isn't a string falls back rather than reaching React as a child.
 */
export const errorDetail = (error: unknown, fallback: string): string => {
  const detail = (error as ApiErrorShape | null)?.response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
};
