import { describe, expect, it } from 'vitest';
import { eventInputSchema } from '@/lib/analytics/events';
import { z } from '@/lib/zod';

describe('zod bez eval', () => {
  it('schematy aplikacji działają w trybie jitless (CSP bez unsafe-eval)', () => {
    expect(z.config().jitless).toBe(true);
    expect(eventInputSchema.safeParse({}).success).toBe(false);
  });
});
