// A guest id is a random UUID v4 made by the frontend (crypto.randomUUID()) and kept in localStorage.
export const GUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const GUEST_HEADER = 'X-Guest-Id';
export const GUEST_TTL_DAYS = 90; // guests unused for this long are removed by npm run cleanup:guests