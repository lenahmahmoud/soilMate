// The one error shape used by every error response.
export function errorBody(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { error };
}