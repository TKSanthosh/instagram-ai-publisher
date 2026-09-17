import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads default content configuration from prompts/content.json.
 * @returns {Object}
 */
export function loadContentConfig() {
  const configPath = path.resolve(__dirname, '../../prompts/content.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // Fallback default config if file is missing
    return {
      topic: 'technology',
      theme: 'artificial intelligence',
      style: 'modern professional digital art, sleek aesthetic, cinematic lighting',
      aspectRatio: '4:5',
      language: 'English',
      mood: 'inspiring, forward-thinking',
      subjects: ['an elegant abstract representation of AI and technology in harmony'],
    };
  }
}

/**
 * Generates an MD5 / SHA-256 fingerprint for a prompt to support idempotency checks.
 * @param {string} promptText
 * @returns {string}
 */
export function createPromptHash(promptText) {
  return crypto.createHash('sha256').update(promptText.trim().toLowerCase()).digest('hex');
}

/**
 * Generates an image prompt and accompanying metadata from configuration.
 * @param {Object} [overrides={}]
 * @param {number} [subjectIndex=0] Optional index to choose a specific subject
 * @returns {{ prompt: string, hash: string, config: Object }}
 */
export function generatePrompt(overrides = {}, subjectIndex = 0) {
  const baseConfig = loadContentConfig();
  const merged = { ...baseConfig, ...overrides };

  const subjects = merged.subjects && merged.subjects.length > 0 ? merged.subjects : [merged.theme];
  const selectedSubject = subjects[subjectIndex % subjects.length];

  // Construct a detailed visual prompt for Gemini Nano Banana image generation
  const promptParts = [
    `A high quality visual depicting ${selectedSubject}.`,
    `Topic: ${merged.topic}.`,
    `Style: ${merged.style}.`,
    `Atmosphere and Mood: ${merged.mood || 'sophisticated, inspirational'}.`,
    `Composition: perfectly balanced vertical portrait composition optimized for ${merged.aspectRatio || '4:5'} aspect ratio.`,
    `Visual quality: studio lighting, ultra-detailed textures, photorealistic fidelity, vibrant balanced color grading.`,
  ];

  if (merged.negativePrompt) {
    promptParts.push(`Avoid: ${merged.negativePrompt}.`);
  }

  const prompt = promptParts.join(' ');
  const hash = createPromptHash(prompt);

  return {
    prompt,
    hash,
    config: merged,
    subject: selectedSubject,
  };
}
