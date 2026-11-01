import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  MONGO_URI: z
    .string()
    .refine((v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), {
      message: 'must start with mongodb:// or mongodb+srv://',
    }),
  CLIENT_ORIGIN: z.string().url(),
  NASA_FEATURE: z.enum(['true', 'false']).transform((v) => v === 'true'),
  ATTEMPT_TTL_DAYS: z.coerce.number().int().min(1),
});

export function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }
  return Object.freeze(result.data);
}

function load() {
  try {
    return parseEnv(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

export const env = load();