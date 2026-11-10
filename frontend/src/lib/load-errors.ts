/** A load failure as one line the UI can show. */
export function describeLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // fetch() reports an unreachable host and a CORS refusal the same way.
  if (error instanceof TypeError && /fetch/i.test(message))
    return "Could not reach the URL (network error, or the server does not allow cross-origin requests).";
  // zarrita: neither v3 nor v2 metadata at the URL.
  if (error instanceof Error && error.name === "NotFoundError")
    return "No OME-Zarr store found at this URL.";
  return message || "Unknown error";
}
