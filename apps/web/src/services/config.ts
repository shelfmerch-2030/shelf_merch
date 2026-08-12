/**
 * In dev, always use the Vite proxy (`/api/v1` → localhost:3001) to avoid CORS issues.
 * In production builds, use VITE_API_URL from the environment.
 */
export const API_BASE = import.meta.env.DEV
  ? "/api/v1"
  : (import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api/v1");

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
