import { describe, it, expect } from 'vitest';
import {
  generatePrompt,
  loadContentConfig,
  resolveTheme,
} from '../src/content/prompt-generator.js';

describe('Prompt Generator for THIMMA KANNAN SHOP', () => {
  it('loads brand configuration with exact spelling THIMMA KANNAN SHOP', () => {
    const config = loadContentConfig();
    expect(config.brand?.name).toBe('THIMMA KANNAN SHOP');
  });

  it('generates prompt containing exact brand name and 4:5 aspect ratio', () => {
    const result = generatePrompt();
    expect(result.prompt).toContain('THIMMA KANNAN SHOP');
    expect(result.prompt).toContain('4:5');
    expect(result.brand).toBe('THIMMA KANNAN SHOP');
    expect(result.hash).toHaveLength(64);
    expect(result.theme).toBeDefined();
  });

  it('generates different prompts for different content themes', () => {
    const storefrontResult = generatePrompt({ theme: 'storefront promotion' });
    const festivalResult = generatePrompt({ theme: 'festival promotion' });
    const productResult = generatePrompt({ theme: 'product showcase' });

    expect(storefrontResult.prompt).not.toBe(festivalResult.prompt);
    expect(festivalResult.prompt).not.toBe(productResult.prompt);
    expect(storefrontResult.prompt).toContain('signboard');
    expect(festivalResult.prompt).toContain('festive');
  });

  it('resolves theme from schedule or theme choice', () => {
    const config = loadContentConfig();
    expect(resolveTheme(config, 'new arrivals')).toBe('new arrivals');
    expect(resolveTheme(config, 0)).toBe('storefront promotion');
  });

  it('does not invent fake claims in visual prompts', () => {
    const result = generatePrompt();
    const lowerPrompt = result.prompt.toLowerCase();
    expect(lowerPrompt).not.toContain('lowest price');
    expect(lowerPrompt).not.toContain('cheapest');
    expect(lowerPrompt).not.toContain('100% guaranteed');
  });

  it('supports future brand assets without errors', () => {
    const result = generatePrompt({
      brand: {
        name: 'THIMMA KANNAN SHOP',
        assets: {
          brandColors: ['warm saffron gold', 'clean ivory white'],
          products: ['household essentials', 'festive collections'],
        },
      },
    });

    expect(result.prompt).toContain('warm saffron gold');
    expect(result.prompt).toContain('household essentials');
  });
});
