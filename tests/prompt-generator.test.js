import { describe, it, expect } from 'vitest';
import {
  generatePrompt,
  createPromptHash,
  loadContentConfig,
} from '../src/content/prompt-generator.js';

describe('Prompt Generator', () => {
  it('loads content config successfully', () => {
    const config = loadContentConfig();
    expect(config).toBeDefined();
    expect(config.topic).toBeDefined();
  });

  it('generates a detailed prompt with default config', () => {
    const result = generatePrompt();
    expect(result.prompt).toBeDefined();
    expect(typeof result.prompt).toBe('string');
    expect(result.prompt.length).toBeGreaterThan(30);
    expect(result.hash).toBeDefined();
    expect(result.hash).toHaveLength(64); // SHA-256 hex length
  });

  it('generates consistent hashes for identical prompts', () => {
    const hash1 = createPromptHash('A futuristic neon laboratory with robotic arms');
    const hash2 = createPromptHash('A futuristic neon laboratory with robotic arms');
    const hash3 = createPromptHash('Different prompt entirely');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('accepts config overrides', () => {
    const result = generatePrompt({
      topic: 'space exploration',
      theme: 'deep cosmos',
      aspectRatio: '1:1',
    });

    expect(result.prompt).toContain('space exploration');
    expect(result.config.aspectRatio).toBe('1:1');
  });
});
