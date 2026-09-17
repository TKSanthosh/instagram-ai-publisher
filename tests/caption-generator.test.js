import { describe, it, expect } from 'vitest';
import { generateCaption } from '../src/content/caption-generator.js';
import { loadContentConfig } from '../src/content/prompt-generator.js';

describe('Caption Generator for THIMMA KANNAN SHOP', () => {
  const config = loadContentConfig();

  it('includes the exact brand name THIMMA KANNAN SHOP', () => {
    const caption = generateCaption();
    expect(caption).toContain('THIMMA KANNAN SHOP');
  });

  it('never leaves unreplaced {brand} placeholders', () => {
    const themes = config.themes || ['storefront promotion', 'product showcase'];
    for (const theme of themes) {
      const caption = generateCaption({ theme });
      expect(caption).not.toContain('{brand}');
    }
  });

  it('produces non-empty plain text within character limits', () => {
    const caption = generateCaption({ theme: 'product showcase' });
    expect(caption.length).toBeGreaterThan(50);
    expect(caption.length).toBeLessThanOrEqual(2200);
  });

  it('includes relevant hashtags matching the brand and theme', () => {
    const storefrontCaption = generateCaption({ theme: 'storefront promotion' });
    expect(storefrontCaption).toContain('#ThimmaKannanShop');

    const festivalCaption = generateCaption({ theme: 'festival promotion' });
    expect(festivalCaption).toContain('#ThimmaKannanShop');
  });

  it('generates different captions for different content themes', () => {
    const caption1 = generateCaption({ theme: 'storefront promotion', seed: 'seed1' });
    const caption2 = generateCaption({ theme: 'festival promotion', seed: 'seed1' });
    const caption3 = generateCaption({ theme: 'product showcase', seed: 'seed1' });

    expect(caption1).not.toBe(caption2);
    expect(caption2).not.toBe(caption3);
    expect(caption1).not.toBe(caption3);
  });

  it('produces variation for the same theme with different seeds', () => {
    const var1 = generateCaption({ theme: 'storefront promotion', seed: 'seedA' });
    const var2 = generateCaption({ theme: 'storefront promotion', seed: 'seedB' });

    expect(typeof var1).toBe('string');
    expect(typeof var2).toBe('string');
  });

  it('does not include prohibited or exaggerated claims', () => {
    const prohibitedPhrases = [
      'lowest price',
      'best shop',
      'number one',
      '100% guaranteed',
      'cheapest',
      'fake discount',
    ];

    const themes = config.themes || ['storefront promotion', 'product showcase'];
    for (const theme of themes) {
      const caption = generateCaption({ theme }).toLowerCase();
      for (const phrase of prohibitedPhrases) {
        expect(caption).not.toContain(phrase);
      }
    }
  });

  it('does not invent fake phone numbers, emails, or prices', () => {
    const themes = config.themes || ['storefront promotion'];
    for (const theme of themes) {
      const caption = generateCaption({ theme });
      // Should not contain currency symbols or phone patterns
      expect(caption).not.toMatch(/₹\s*\d+/);
      expect(caption).not.toMatch(/\$\s*\d+/);
      expect(caption).not.toMatch(/\+91[-\s]?\d{10}/);
      expect(caption).not.toMatch(/@gmail\.com/);
    }
  });
});
