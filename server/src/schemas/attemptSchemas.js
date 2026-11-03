import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/, 'must be a 24-character hex string');
const choiceKey = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be 1 to 40 lowercase letters, digits or hyphens');

// Format only. An unknown but well-formed slug is a 404 (contract), checked in the service.
export const slugParam = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/, 'must be a lowercase slug'),
});

export const attemptIdParam = z.strictObject({ attemptId: objectId });

export const answerBody = z.strictObject({ questionId: objectId, choiceKey });

export const skipBody = z.strictObject({ questionId: objectId });

// Start, complete, abandon and reset take no body. An empty body or {} is fine.
export const emptyBody = z.strictObject({}).optional();