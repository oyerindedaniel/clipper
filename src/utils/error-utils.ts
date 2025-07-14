/**
 * Converts any unknown error into a standard Error instance.
 *
 * @param error - The unknown error input
 * @returns An Error object
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return new Error((error as { message: string }).message);
  }

  return new Error("An unknown error occurred");
}
