import { describe, it, expect } from 'vitest';
import {
  validatePublicImageUrl,
  validateImageForInstagram,
  validatePrompt,
} from '../src/utils/validation.js';

describe('Validation Utility', () => {
  describe('validatePublicImageUrl', () => {
    it('accepts valid public HTTPS URLs', () => {
      const result = validatePublicImageUrl('https://my-bucket.s3.amazonaws.com/posts/test.jpg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects non-HTTPS URLs', () => {
      const result = validatePublicImageUrl('http://my-bucket.s3.amazonaws.com/posts/test.jpg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('rejects localhost URLs', () => {
      const result = validatePublicImageUrl('https://localhost:8080/test.jpg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('publicly accessible');
    });

    it('rejects 127.0.0.1 URLs', () => {
      const result = validatePublicImageUrl('https://127.0.0.1/test.jpg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('publicly accessible');
    });

    it('rejects empty or invalid URLs', () => {
      expect(validatePublicImageUrl('').valid).toBe(false);
      expect(validatePublicImageUrl(null).valid).toBe(false);
      expect(validatePublicImageUrl('not-a-valid-url').valid).toBe(false);
    });
  });

  describe('validateImageForInstagram', () => {
    it('accepts valid JPEG buffer within constraints', () => {
      const dummyBuffer = Buffer.alloc(1024 * 50); // 50 KB
      const result = validateImageForInstagram(dummyBuffer, {
        width: 1080,
        height: 1350, // 4:5 ratio (0.80)
        mimeType: 'image/jpeg',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects buffer exceeding 8 MB', () => {
      const largeBuffer = Buffer.alloc(9 * 1024 * 1024); // 9 MB
      const result = validateImageForInstagram(largeBuffer);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds Meta\'s 8 MB limit');
    });

    it('rejects non-buffer input', () => {
      const result = validateImageForInstagram('not a buffer');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be a valid Buffer');
    });

    it('rejects unsupported mime types', () => {
      const dummyBuffer = Buffer.alloc(1024);
      const result = validateImageForInstagram(dummyBuffer, {
        mimeType: 'image/gif',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not supported');
    });

    it('rejects aspect ratios outside 4:5 to 1.91:1', () => {
      const dummyBuffer = Buffer.alloc(1024);
      // Extreme tall ratio (e.g. 9:16 = 0.5625 < 0.80)
      const tallResult = validateImageForInstagram(dummyBuffer, {
        width: 1080,
        height: 1920,
      });
      expect(tallResult.valid).toBe(false);
      expect(tallResult.errors[0]).toContain('Aspect ratio');
    });
  });

  describe('validatePrompt', () => {
    it('accepts valid descriptive prompts', () => {
      const result = validatePrompt('A futuristic city powered by renewable artificial intelligence');
      expect(result.valid).toBe(true);
    });

    it('rejects empty or very short prompts', () => {
      expect(validatePrompt('').valid).toBe(false);
      expect(validatePrompt('   ').valid).toBe(false);
      expect(validatePrompt('cat').valid).toBe(false);
    });
  });
});
