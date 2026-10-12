// Base URL of the shared Mirai API (same backend as the other portals). Never put secrets here.
export const API_BASE_URL: string = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'https://club-tracker-demo-api.onrender.com'
).replace(/\/+$/, '');

// Per-portal token key, identical to the existing student portal (frontend/shared/auth/session.js).
export const TOKEN_KEY = 'mirai:student:token';
export const EXPECTED_ROLE = 'student';
