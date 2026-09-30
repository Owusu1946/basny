/** Browsers use the same-origin proxy; server renders contact the API directly. */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  if (!serverUrl) throw new Error("NEXT_PUBLIC_SERVER_URL is not configured.");
  return serverUrl.replace(/\/$/, "");
}
