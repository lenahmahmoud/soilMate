import { AppError } from '../utils/AppError.js';

// validate({ body, params, query }): each one is an optional zod schema.
// On success, req.body / req.params / req.query are replaced by the parsed values.
export function validate({ body, params, query } = {}) {
  const parts = [
    ['body', body],
    ['params', params],
    ['query', query],
  ];

  return (req, res, next) => {
    const parsed = {};
    const issues = [];

    for (const [part, schema] of parts) {
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        parsed[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ path: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (issues.length) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request', { issues }));
    }

    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params;
    if ('query' in parsed) {
      // In Express 5, req.query is a getter, so it is redefined instead of assigned.
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}