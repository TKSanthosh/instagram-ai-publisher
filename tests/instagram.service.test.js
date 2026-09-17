import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstagramService } from '../src/services/instagram.service.js';

describe('InstagramService (Meta Graph API Content Publishing)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws error if accessToken or userId is missing in getInstagramAccount', async () => {
    const service = new InstagramService({});
    await expect(service.getInstagramAccount()).rejects.toThrow('requires accessToken and userId');
  });

  it('verifies Instagram account successfully', async () => {
    const mockUserResponse = {
      id: '17841400008460000',
      username: 'tech_creator_ai',
      name: 'AI Insights',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUserResponse,
    });

    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
      apiVersion: 'v22.0',
    });

    const account = await service.getInstagramAccount();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('graph.facebook.com/v22.0/17841400008460000');
    expect(account.username).toBe('tech_creator_ai');
  });

  it('creates media container with public HTTPS URL and caption', async () => {
    const mockContainerResponse = { id: '17923456789012345' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockContainerResponse,
    });

    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
      apiVersion: 'v22.0',
    });

    const container = await service.createMediaContainer(
      'https://my-bucket.s3.amazonaws.com/posts/photo.jpg',
      'AI generated masterpiece 🚀'
    );

    expect(container.id).toBe('17923456789012345');
    const calledOptions = global.fetch.mock.calls[0][1];
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.body).toContain('image_url=https%3A%2F%2Fmy-bucket.s3.amazonaws.com%2Fposts%2Fphoto.jpg');
    expect(calledOptions.body).toContain('caption=AI+generated+masterpiece');
  });

  it('rejects media container creation if image URL is invalid or localhost', async () => {
    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
    });

    await expect(
      service.createMediaContainer('http://localhost:8080/image.jpg', 'caption')
    ).rejects.toThrow('Invalid image URL');
  });

  it('waits for media container readiness when status is FINISHED', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '17923456789012345', status_code: 'FINISHED' }),
    });

    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
    });

    await expect(
      service.waitForMediaContainerReady('17923456789012345', { maxWaitMs: 2000, intervalMs: 50 })
    ).resolves.toBeUndefined();
  });

  it('throws an error if container processing returns ERROR', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '17923456789012345',
        status_code: 'ERROR',
        status: 'Media format unsupported',
      }),
    });

    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
    });

    await expect(
      service.waitForMediaContainerReady('17923456789012345', { maxWaitMs: 2000, intervalMs: 50 })
    ).rejects.toThrow('Media container processing failed with status: ERROR');
  });

  it('publishes media container successfully', async () => {
    const mockPublishResponse = { id: '9876543210987654' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPublishResponse,
    });

    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
    });

    const result = await service.publishMedia('17923456789012345');

    expect(result.id).toBe('9876543210987654');
    const calledOptions = global.fetch.mock.calls[0][1];
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.body).toContain('creation_id=17923456789012345');
  });

  it('translates Meta Graph API errors properly', async () => {
    const metaErrorPayload = {
      error: {
        message: 'The user is not authorized to perform this action',
        type: 'OAuthException',
        code: 10,
        error_subcode: 2207050,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => metaErrorPayload,
    });

    const service = new InstagramService({
      accessToken: 'EAAB_MOCK_TEST_TOKEN',
      userId: '17841400008460000',
      maxRetries: 0,
    });

    await expect(service.getInstagramAccount()).rejects.toThrow(
      'Meta Graph API Error [10]: The user is not authorized to perform this action'
    );
  });
});
