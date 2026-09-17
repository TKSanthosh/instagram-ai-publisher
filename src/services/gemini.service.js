import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { validatePrompt } from '../utils/validation.js';

/**
 * Gemini Service using official @google/genai SDK to generate images
 * with Gemini's Nano Banana multimodal models (e.g. gemini-2.5-flash-image).
 */
export class GeminiService {
  /**
   * @param {Object} options
   * @param {string} options.apiKey Google Gemini API Key
   * @param {string} [options.model='gemini-2.5-flash-image'] Configurable Nano Banana model
   * @param {number} [options.timeoutMs=60000] Timeout in milliseconds
   * @param {number} [options.maxRetries=3]
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('GeminiService requires an apiKey.');
    }

    this.apiKey = options.apiKey;
    this.model = options.model || 'gemini-2.5-flash-image';
    this.timeoutMs = options.timeoutMs || 60000;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;

    // Initialize the official GoogleGenAI client
    this.ai = new GoogleGenAI({
      apiKey: this.apiKey,
    });
  }

  /**
   * Calls Gemini Nano Banana to generate an image from a prompt.
   * @param {string} prompt Descriptive text prompt for the image
   * @param {Object} [options]
   * @param {string} [options.aspectRatio='4:5'] Desired aspect ratio
   * @returns {Promise<{ buffer: Buffer, mimeType: string, model: string }>}
   */
  async generateImage(prompt, _options = {}) {
    const validation = validatePrompt(prompt);
    if (!validation.valid) {
      throw new Error(`Invalid prompt for Gemini image generation: ${validation.error}`);
    }

    logger.info(`Requesting image generation from Gemini using model: '${this.model}'...`, {
      promptLength: prompt.length,
      model: this.model,
    });

    const executeCall = async () => {
      let response;

      try {
        // Nano Banana models generate images via generateContent with image modality
        response = await this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        });
      } catch (err) {
        logger.error(`Gemini API call failed with model '${this.model}': ${err.message}`);
        throw err;
      }

      return this.parseGeminiImageResponse(response);
    };

    return withRetry(executeCall, {
      maxRetries: this.maxRetries,
      operationName: `Gemini.generateImage(${this.model})`,
    });
  }

  /**
   * Parses the modern Gemini response structure to extract image buffer and mimeType.
   * Handles:
   * 1. candidates[0].content.parts[...].inlineData ({ mimeType, data })
   * 2. generatedImages[0].image ({ mimeType, imageBytes }) if SDK provides specialized image wrapper
   * @param {any} response
   * @returns {{ buffer: Buffer, mimeType: string, model: string }}
   */
  parseGeminiImageResponse(response) {
    if (!response) {
      throw new Error('Gemini API returned an empty or undefined response.');
    }

    // Check candidate content parts (multimodal Nano Banana output)
    const candidates = response.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const base64Data = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/jpeg';
            const buffer = Buffer.from(base64Data, 'base64');

            logger.info('Successfully received image from Gemini content part.', {
              mimeType,
              bytes: buffer.length,
              model: this.model,
            });

            return {
              buffer,
              mimeType,
              model: this.model,
            };
          }
        }
      }
    }

    // Check fallback generatedImages if SDK or Vertex endpoint wraps image object
    if (Array.isArray(response.generatedImages) && response.generatedImages.length > 0) {
      const img = response.generatedImages[0].image;
      const base64Data = img?.imageBytes;
      if (base64Data) {
        const mimeType = img.mimeType || 'image/jpeg';
        const buffer = Buffer.from(base64Data, 'base64');

        logger.info('Successfully received image from Gemini generatedImages wrapper.', {
          mimeType,
          bytes: buffer.length,
          model: this.model,
        });

        return {
          buffer,
          mimeType,
          model: this.model,
        };
      }
    }

    // If no image parts were found, inspect if text was returned explaining a block or failure
    const textOutput =
      response.text ||
      (candidates && candidates[0]?.content?.parts?.find((p) => p.text)?.text) ||
      '';

    throw new Error(
      `Gemini response did not contain image data. Model output: ${
        textOutput ? textOutput.slice(0, 300) : 'No text explanation available'
      }`
    );
  }
}
