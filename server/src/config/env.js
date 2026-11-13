import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const schema = z
  .object({
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

    // SoilMate
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_EXPIRES_DEFAULT: z.string().default('1d'),
    JWT_EXPIRES_REMEMBER: z.string().default('30d'),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    PUBLIC_BASE_URL: z.string().url().optional(),
    LAYER_DATA_DIR: z.string().default('src/data/layers'),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && !v.PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_BASE_URL'],
        message: 'required in production',
      });
    }
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