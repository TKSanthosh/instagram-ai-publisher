import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPublisher } from '../src/index.js';
import { GeminiService } from '../src/services/gemini.service.js';
import { StorageService } from '../src/services/storage.service.js';
import { InstagramService } from '../src/services/instagram.service.js';
import { StateService, MemoryStateStore } from '../src/services/state.service.js';

describe('Publisher Workflow Orchestrator', () => {
  let mockConfig;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockConfig = {
      dryRun: true,
      gemini: {
        apiKey: 'test-gemini-key',
        model: 'gemini-2.5-flash-image',
      },
      instagram: {
        accessToken: 'test-instagram-token',
        userId: '17841400008460000',
        apiVersion: 'v22.0',
      },
      supabase: {
        url: 'https://xyzproject.supabase.co',
        serviceRoleKey: 'test-service-role-key',
        bucket: 'instagram-images',
        useSignedUrl: false,
      },
      post: {
        caption: 'Workflow test caption 🚀',
        imageWidth: 1080,
        imageHeight: 1350,
        aspectRatio: '4:5',
      },
      resilience: {
        maxRetries: 1,
        retryDelayMs: 10,
        requestTimeoutMs: 5000,
        idempotencyWindowMinutes: 60,
      },
      state: {
        driver: 'memory',
      },
    };
  });

  it('completes DRY_RUN mode cleanly without calling Instagram publishing', async () => {
    // Mock GeminiService.generateImage
    vi.spyOn(GeminiService.prototype, 'generateImage').mockResolvedValue({
      buffer: Buffer.from('mock-gemini-nano-banana-image-data'),
      mimeType: 'image/jpeg',
      model: 'gemini-2.5-flash-image',
    });

    // Mock StorageService.uploadImage
    vi.spyOn(StorageService.prototype, 'uploadImage').mockResolvedValue({
      url: 'https://xyzproject.supabase.co/storage/v1/object/public/instagram-images/posts/test.jpg',
      path: 'posts/test.jpg',
      bucket: 'instagram-images',
      isSigned: false,
    });

    // Mock Instagram publish spy
    const publishSpy = vi.spyOn(InstagramService.prototype, 'publishMedia');
    const containerSpy = vi.spyOn(InstagramService.prototype, 'createMediaContainer');

    // Mock StateService
    const memoryStore = new MemoryStateStore();
    vi.spyOn(StateService, 'create').mockReturnValue(
      new StateService(memoryStore, { idempotencyWindowMinutes: 60 })
    );

    const result = await runPublisher(mockConfig);

    expect(result.status).toBe('DRY_RUN_SUCCESS');
    expect(result.imageUrl).toContain('https://xyzproject.supabase.co/storage/');
    expect(publishSpy).not.toHaveBeenCalled();
    expect(containerSpy).not.toHaveBeenCalled();
  });

  it('completes live publishing flow successfully when DRY_RUN is false', async () => {
    mockConfig.dryRun = false;

    vi.spyOn(GeminiService.prototype, 'generateImage').mockResolvedValue({
      buffer: Buffer.from('mock-gemini-image-data'),
      mimeType: 'image/jpeg',
      model: 'gemini-2.5-flash-image',
    });

    vi.spyOn(StorageService.prototype, 'uploadImage').mockResolvedValue({
      url: 'https://xyzproject.supabase.co/storage/v1/object/public/instagram-images/posts/live-test.jpg',
      path: 'posts/live-test.jpg',
      bucket: 'instagram-images',
      isSigned: false,
    });

    vi.spyOn(InstagramService.prototype, 'getInstagramAccount').mockResolvedValue({
      id: '17841400008460000',
      username: 'tech_creator_ai',
    });

    vi.spyOn(InstagramService.prototype, 'createMediaContainer').mockResolvedValue({
      id: 'container-9999',
    });

    vi.spyOn(InstagramService.prototype, 'waitForMediaContainerReady').mockResolvedValue(undefined);

    vi.spyOn(InstagramService.prototype, 'publishMedia').mockResolvedValue({
      id: 'media-post-8888',
    });

    const memoryStore = new MemoryStateStore();
    const stateService = new StateService(memoryStore, { idempotencyWindowMinutes: 60 });
    vi.spyOn(StateService, 'create').mockReturnValue(stateService);

    const result = await runPublisher(mockConfig);

    expect(result.status).toBe('SUCCESS');
    expect(result.mediaId).toBe('media-post-8888');

    // Verify state was saved
    const state = await memoryStore.read();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].mediaId).toBe('media-post-8888');
  });

  it('skips execution if the prompt was published within the idempotency window', async () => {
    const memoryStore = new MemoryStateStore({
      history: [
        {
          promptHash: 'mock-duplicate-hash',
          timestamp: new Date().toISOString(),
          mediaId: 'previous-media-id',
        },
      ],
      lastRun: null,
    });

    const stateService = new StateService(memoryStore, { idempotencyWindowMinutes: 60 });
    vi.spyOn(stateService, 'checkDuplicate').mockResolvedValue({
      isDuplicate: true,
      lastPublished: { mediaId: 'previous-media-id' },
    });
    vi.spyOn(StateService, 'create').mockReturnValue(stateService);

    const geminiSpy = vi.spyOn(GeminiService.prototype, 'generateImage');

    const result = await runPublisher(mockConfig);

    expect(result.status).toBe('SKIPPED_DUPLICATE');
    expect(geminiSpy).not.toHaveBeenCalled();
  });
});
