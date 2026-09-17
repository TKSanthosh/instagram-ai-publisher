import { describe, it, expect, vi } from 'vitest';
import { isTransientError, calculateBackoff, withRetry } from '../src/utils/retry.js';

describe('Retry Utility', () => {
  describe('isTransientError', () => {
    it('identifies HTTP 429 as transient', () => {
      expect(isTransientError({ statusCode: 429 })).toBe(true);
      expect(isTransientError({ status: 429 })).toBe(true);
    });

    it('identifies HTTP 5xx errors as transient', () => {
      expect(isTransientError({ statusCode: 500 })).toBe(true);
      expect(isTransientError({ statusCode: 502 })).toBe(true);
      expect(isTransientError({ statusCode: 503 })).toBe(true);
      expect(isTransientError({ statusCode: 504 })).toBe(true);
    });

    it('identifies 4xx errors as non-transient', () => {
      expect(isTransientError({ statusCode: 400 })).toBe(false);
      expect(isTransientError({ statusCode: 401 })).toBe(false);
      expect(isTransientError({ statusCode: 403 })).toBe(false);
      expect(isTransientError({ statusCode: 404 })).toBe(false);
    });

    it('identifies network codes as transient', () => {
      expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
      expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isTransientError({ name: 'AbortError' })).toBe(true);
    });

    it('returns false for generic non-transient errors', () => {
      expect(isTransientError(new Error('Syntax error in payload'))).toBe(false);
      expect(isTransientError(null)).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    it('increases exponentially within capped limit', () => {
      const delay0 = calculateBackoff(0, 100, 5000);
      const delay1 = calculateBackoff(1, 100, 5000);
      const delay2 = calculateBackoff(2, 100, 5000);

      expect(delay0).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeGreaterThanOrEqual(200);
      expect(delay2).toBeGreaterThanOrEqual(400);

      const capped = calculateBackoff(10, 100, 1000);
      expect(capped).toBeLessThanOrEqual(1000);
    });
  });

  describe('withRetry', () => {
    it('returns result immediately on successful first call', async () => {
      const mockFn = vi.fn().mockResolvedValue('success-value');
      const result = await withRetry(mockFn, { maxRetries: 2, baseDelay: 10 });

      expect(result).toBe('success-value');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('retries on transient failure and succeeds', async () => {
      const transientErr = new Error('503 Service Unavailable');
      transientErr.statusCode = 503;

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(transientErr)
        .mockResolvedValueOnce('recovered-value');

      const result = await withRetry(mockFn, { maxRetries: 2, baseDelay: 10 });

      expect(result).toBe('recovered-value');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('fails immediately on non-transient error without retrying', async () => {
      const fatalErr = new Error('401 Unauthorized');
      fatalErr.statusCode = 401;

      const mockFn = vi.fn().mockRejectedValue(fatalErr);

      await expect(
        withRetry(mockFn, { maxRetries: 3, baseDelay: 10 })
      ).rejects.toThrow('401 Unauthorized');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('throws after exceeding max retries', async () => {
      const transientErr = new Error('429 Rate limited');
      transientErr.statusCode = 429;

      const mockFn = vi.fn().mockRejectedValue(transientErr);

      await expect(
        withRetry(mockFn, { maxRetries: 2, baseDelay: 10 })
      ).rejects.toThrow('429 Rate limited');

      expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });
});
