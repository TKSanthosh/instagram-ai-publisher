import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads brand and content configuration from prompts/content.json.
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
      brand: {
        name: 'THIMMA KANNAN SHOP',
        displayName: 'THIMMA KANNAN SHOP',
        industry: 'Indian Retail Store',
      },
      content: {
        purpose: 'Instagram promotional content',
        tone: ['premium', 'trustworthy', 'welcoming'],
        aspectRatio: '4:5',
        visualStyle: 'photorealistic commercial advertising',
      },
      themes: ['storefront promotion', 'product showcase', 'shopping experience'],
      schedule: {
        0: 'general store promotion',
        1: 'storefront promotion',
        2: 'product showcase',
        3: 'new arrivals',
        4: 'shopping experience',
        5: 'special offer',
        6: 'festival promotion',
      },
    };
  }
}

/**
 * Generates an SHA-256 fingerprint for a prompt to support idempotency checks.
 * @param {string} promptText
 * @returns {string}
 */
export function createPromptHash(promptText) {
  return crypto.createHash('sha256').update(promptText.trim().toLowerCase()).digest('hex');
}

/**
 * Selects the theme based on options, day of week, or cycle index.
 * @param {Object} config
 * @param {string|number|undefined} themeChoice
 * @returns {string}
 */
export function resolveTheme(config, themeChoice) {
  if (typeof themeChoice === 'string' && themeChoice.trim().length > 0) {
    return themeChoice.trim().toLowerCase();
  }

  const themes = config.themes || ['general store promotion'];

  if (typeof themeChoice === 'number') {
    return themes[themeChoice % themes.length];
  }

  // Auto-schedule based on day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = new Date().getDay();
  if (config.schedule && config.schedule[dayOfWeek]) {
    return config.schedule[dayOfWeek];
  }

  return themes[0];
}

/**
 * Generates an image-generation prompt for THIMMA KANNAN SHOP.
 * Tailored specifically for Gemini Nano Banana image models.
 * @param {Object} [overrides={}]
 * @returns {{ prompt: string, hash: string, config: Object, theme: string, brand: string, imageContext: string }}
 */
export function generatePrompt(overrides = {}) {
  const baseConfig = loadContentConfig();
  const merged = { ...baseConfig, ...overrides };

  const brandName = merged.brand?.name || 'THIMMA KANNAN SHOP';
  const theme = resolveTheme(merged, overrides.theme);

  // Retrieve theme-specific visual direction
  const visualConcept =
    merged.themeVisuals?.[theme] ||
    `A premium, welcoming retail scene at ${brandName} showing organized product displays and warm lighting.`;

  // Additional future brand assets if configured
  const brandAssets = merged.brand?.assets || {};
  const assetDirectives = [];
  if (brandAssets.brandColors && brandAssets.brandColors.length > 0) {
    assetDirectives.push(`Brand color palette: ${brandAssets.brandColors.join(', ')}.`);
  }
  if (brandAssets.products && brandAssets.products.length > 0) {
    assetDirectives.push(`Featured store departments: ${brandAssets.products.join(', ')}.`);
  }

  // Construct structured visual prompt
  const promptParts = [
    `A premium, photorealistic commercial advertising photograph for "${brandName}".`,
    `Concept: ${visualConcept}`,
    `Environment: An attractive Indian retail shop environment with clean, meticulously organized product shelves, professional warm illumination, and welcoming atmosphere.`,
    `Branding requirement: The storefront or interior signage must prominently and clearly display the exact brand name: "${brandName}". The spelling must be precisely "${brandName}".`,
    `Composition: Vertical portrait composition strictly optimized for a ${merged.content?.aspectRatio || '4:5'} aspect ratio (1080x1350 style). All key branding, text, and focal subjects must be positioned safely away from the canvas edges.`,
    `Photography style: High-end commercial retail photography, crisp focal clarity, natural vibrant colors, balanced highlights, and realistic store textures.`,
    ...assetDirectives,
    `Typography and text safety: Use only the exact brand name "${brandName}". Do not render any random gibberish words, fake brand names, distorted text, or watermarks. Keep lettering elegant and legible.`,
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
    theme,
    brand: brandName,
    imageContext: visualConcept,
  };
}
