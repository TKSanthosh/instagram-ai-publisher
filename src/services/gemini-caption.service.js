import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger.js';
import { generateCaption } from '../content/caption-generator.js';

/**
 * Optional AI Caption Service using Google Gemini to generate dynamic captions.
 * Falls back safely to template-based generation if AI call fails or is unconfigured.
 */
export class GeminiCaptionService {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} [options.textModel='gemini-2.5-flash']
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.textModel = options.textModel || 'gemini-2.5-flash';

    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.ai = null;
    }
  }

  /**
   * Generates a caption using Gemini text generation, or falls back to template generator.
   * @param {Object} params
   * @param {string} params.brand
   * @param {string} params.theme
   * @param {string} params.contentContext
   * @param {Object} [params.config]
   * @returns {Promise<string>}
   */
  async generate(params) {
    if (!this.ai) {
      return generateCaption(params);
    }

    const brand = params.brand || 'THIMMA KANNAN SHOP';
    const theme = params.theme || 'general store promotion';

    const systemPrompt = [
      `You are an expert social media copywriter for "${brand}", a quality Indian retail shop.`,
      `Write a concise, engaging, warm Instagram promotional caption for the theme: "${theme}".`,
      `Visual context: ${params.contentContext || 'welcoming retail shop'}`,
      `STRICT RULES:`,
      `1. Mention "${brand}" naturally.`,
      `2. Keep tone friendly, trustworthy, and welcoming.`,
      `3. Do NOT invent prices, discounts, products, offers, phone numbers, or addresses.`,
      `4. Do NOT make unsupported claims like "lowest price", "best shop", "cheapest", or "100% guaranteed".`,
      `5. Keep length between 300 and 600 characters.`,
      `6. Include 3-4 relevant hashtags like #ThimmaKannanShop #Retail #Shopping.`,
      `7. Plain text only without markdown formatting.`,
    ].join('\n');

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: systemPrompt,
      });

      const captionText = response.text ? response.text.trim() : '';
      if (captionText && captionText.includes(brand)) {
        logger.info('Successfully generated AI caption with Gemini.');
        return captionText;
      }
    } catch (err) {
      logger.warn(`Gemini AI caption generation failed: ${err.message}. Falling back to template generator.`);
    }

    return generateCaption(params);
  }
}
