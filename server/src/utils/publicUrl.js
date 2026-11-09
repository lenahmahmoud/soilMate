import { env } from '../config/env.js';

// PUBLIC_BASE_URL is optional in development, so fall back to the local server.
export function publicBaseUrl() {
  return (env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
}