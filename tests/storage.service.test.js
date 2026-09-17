import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../src/services/storage.service.js';

describe('StorageService (Supabase Storage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates unique paths with appropriate extensions', () => {
    const service = new StorageService({ isDryRun: true });
    const path1 = service.generatePath('.jpg');
    const path2 = service.generatePath('.jpg');

    expect(path1).toContain('posts/');
    expect(path1).toMatch(/\.jpg$/);
    expect(path1).not.toBe(path2);
  });

  it('simulates local storage in dry-run mode when Supabase credentials are omitted', async () => {
    const service = new StorageService({ isDryRun: true });
    const dummyBuffer = Buffer.from('fake-image-bytes');

    const result = await service.uploadImage(dummyBuffer, { mimeType: 'image/jpeg' });

    expect(result.url).toContain('https://mock-supabase.local/');
    expect(result.path).toContain('posts/');
    expect(result.bucket).toBe('instagram-images');
    expect(result.isSigned).toBe(false);
  });

  it('throws error when Supabase is unconfigured and not in dry-run mode', async () => {
    const service = new StorageService({ isDryRun: false });
    const dummyBuffer = Buffer.from('fake-image-bytes');

    await expect(service.uploadImage(dummyBuffer)).rejects.toThrow(
      'StorageService is not configured'
    );
  });

  it('uploads to Supabase Storage and returns a public HTTPS URL by default', async () => {
    const mockUpload = vi.fn().mockResolvedValue({ data: { path: 'posts/test.jpg' }, error: null });
    const mockGetPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'https://xyzproject.supabase.co/storage/v1/object/public/instagram-images/posts/test.jpg' },
    });

    const service = new StorageService({
      url: 'https://xyzproject.supabase.co',
      serviceRoleKey: 'test-service-role-key',
      bucket: 'instagram-images',
    });

    // Mock Supabase storage methods
    service.supabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
          getPublicUrl: mockGetPublicUrl,
        }),
      },
    };

    const dummyBuffer = Buffer.from('test-image-content');
    const result = await service.uploadImage(dummyBuffer, { mimeType: 'image/jpeg' });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockGetPublicUrl).toHaveBeenCalledTimes(1);
    expect(result.bucket).toBe('instagram-images');
    expect(result.isSigned).toBe(false);
    expect(result.url).toBe(
      'https://xyzproject.supabase.co/storage/v1/object/public/instagram-images/posts/test.jpg'
    );
  });

  it('generates signed URL when useSignedUrl is true', async () => {
    const mockUpload = vi.fn().mockResolvedValue({ data: { path: 'posts/test.jpg' }, error: null });
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl:
          'https://xyzproject.supabase.co/storage/v1/object/sign/instagram-images/posts/test.jpg?token=mockjwt',
      },
      error: null,
    });

    const service = new StorageService({
      url: 'https://xyzproject.supabase.co',
      serviceRoleKey: 'test-service-role-key',
      bucket: 'instagram-images',
      useSignedUrl: true,
      signedUrlExpiresIn: 900,
    });

    service.supabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
          createSignedUrl: mockCreateSignedUrl,
        }),
      },
    };

    const dummyBuffer = Buffer.from('test-image-content');
    const result = await service.uploadImage(dummyBuffer, { mimeType: 'image/jpeg' });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(expect.any(String), 900);
    expect(result.isSigned).toBe(true);
    expect(result.url).toContain('token=mockjwt');
  });

  it('throws error when upload fails in Supabase', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found' },
    });

    const service = new StorageService({
      url: 'https://xyzproject.supabase.co',
      serviceRoleKey: 'test-service-role-key',
      bucket: 'invalid-bucket',
    });

    service.supabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
        }),
      },
    };

    const dummyBuffer = Buffer.from('test-image-content');
    await expect(service.uploadImage(dummyBuffer)).rejects.toThrow('Supabase Storage upload failed: Bucket not found');
  });
});
