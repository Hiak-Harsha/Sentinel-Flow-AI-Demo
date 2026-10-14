import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Base URL for API requests. Defaults to empty string (same-origin relative URL)
 * so that Vite dev server proxy routes to the backend correctly on LAN / mobile devices.
 */
const apiBaseUrl: string =
  (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/+$/, "") || "";

export const apiClient = createClient<paths>({
  baseUrl: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

export type ApiPaths = paths;
export type { paths };
export default apiClient;
