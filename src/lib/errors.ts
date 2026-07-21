interface ApiErrorShape {
  response?: { data?: { detail?: unknown } };
}

/**
 * Pull a human-readable reason out of an API failure. FastAPI returns a string
 * `detail` for handled errors but an array of objects for schema violations, so
 * anything that isn't a string falls back rather than reaching React as a child.
 */
export const errorDetail = (error: unknown, fallback: string): string => {
  const detail = (error as ApiErrorShape | null)?.response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
};
