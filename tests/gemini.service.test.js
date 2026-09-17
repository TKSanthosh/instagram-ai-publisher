import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiService } from '../src/services/gemini.service.js';

describe('GeminiService (Nano Banana Multimodal Image Generation)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if apiKey is missing in constructor', () => {
    expect(() => new GeminiService({})).toThrow('requires an apiKey');
  });

  it('initializes with custom model from configuration', () => {
    const service = new GeminiService({
      apiKey: 'test-api-key',
      model: 'gemini-3.1-flash-image',
    });
    expect(service.model).toBe('gemini-3.1-flash-image');
  });

  it('rejects invalid prompt', async () => {
    const service = new GeminiService({ apiKey: 'test-api-key' });
    await expect(service.generateImage('')).rejects.toThrow('Invalid prompt');
  });

  it('successfully generates image and returns Buffer from candidates inlineData', async () => {
    const service = new GeminiService({
      apiKey: 'test-api-key',
      model: 'gemini-2.5-flash-image',
    });

    // Create a sample base64 string
    const sampleRawData = 'gemini-nano-banana-test-image-data';
    const sampleBase64 = Buffer.from(sampleRawData).toString('base64');

    // Mock ai.models.generateContent
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Here is your generated image:',
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: sampleBase64,
                },
              },
            ],
          },
        },
      ],
    };

    service.ai.models.generateContent = vi.fn().mockResolvedValue(mockResponse);

    const result = await service.generateImage('A futuristic floating city at sunrise');

    expect(service.ai.models.generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-image',
      contents: 'A futuristic floating city at sunrise',
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.toString()).toBe(sampleRawData);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.model).toBe('gemini-2.5-flash-image');
  });

  it('handles generatedImages response structure fallback', async () => {
    const service = new GeminiService({ apiKey: 'test-api-key' });
    const sampleBase64 = Buffer.from('fallback-image-data').toString('base64');

    const mockResponse = {
      generatedImages: [
        {
          image: {
            imageBytes: sampleBase64,
            mimeType: 'image/png',
          },
        },
      ],
    };

    service.ai.models.generateContent = vi.fn().mockResolvedValue(mockResponse);

    const result = await service.generateImage('Abstract geometric digital art');
    expect(result.buffer.toString()).toBe('fallback-image-data');
    expect(result.mimeType).toBe('image/png');
  });

  it('throws error when response contains no image data', async () => {
    const service = new GeminiService({ apiKey: 'test-api-key' });

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'I cannot generate this image due to safety guidelines.' }],
          },
        },
      ],
    };

    service.ai.models.generateContent = vi.fn().mockResolvedValue(mockResponse);

    await expect(service.generateImage('Unsafe prompt')).rejects.toThrow(
      'did not contain image data'
    );
  });
});
