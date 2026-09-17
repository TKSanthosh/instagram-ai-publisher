import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { validatePublicImageUrl } from '../utils/validation.js';

/**
 * Storage Service managing image uploads to Supabase Storage.
 * Generates public HTTPS URLs optimized for Meta Instagram crawler retrieval.
 */
export class StorageService {
  /**
   * @param {Object} options
   * @param {string} options.url Supabase Project URL
   * @param {string} options.serviceRoleKey Supabase Service Role Key (secret)
   * @param {string} [options.bucket='instagram-images'] Supabase Storage Bucket Name
   * @param {boolean} [options.useSignedUrl=false] Whether to use signed URLs instead of public bucket URLs
   * @param {number} [options.signedUrlExpiresIn=1800] Lifetime in seconds if signed URLs are used
   * @param {boolean} [options.isDryRun=false]
   * @param {number} [options.maxRetries=3]
   */
  constructor(options = {}) {
    this.url = options.url ? options.url.replace(/\/+$/, '') : '';
    this.serviceRoleKey = options.serviceRoleKey || '';
    this.bucket = options.bucket || 'instagram-images';
    this.useSignedUrl = Boolean(options.useSignedUrl);
    this.signedUrlExpiresIn = options.signedUrlExpiresIn || 1800; // 30 mins
    this.isDryRun = Boolean(options.isDryRun);
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;

    if (this.url && this.serviceRoleKey) {
      // Initialize official Supabase client with service role key for backend administration
      this.supabase = createClient(this.url, this.serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          transport: WebSocket,
        },
      });
    } else {
      this.supabase = null;
    }
  }

  /**
   * Generates a unique, collision-resistant storage path.
   * @param {string} extension File extension (e.g. '.jpg')
   * @returns {string}
   */
  generatePath(extension = '.jpg') {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `posts/${dateStr}/${timestamp}-${randomHex}${ext}`;
  }

  /**
   * Uploads an image buffer to Supabase Storage and returns an HTTPS URL.
   * Meta Instagram API requires a publicly accessible HTTPS URL.
   * @param {Buffer} buffer Image byte buffer
   * @param {Object} [metadata={}]
   * @param {string} [metadata.mimeType='image/jpeg']
   * @param {string} [metadata.extension='.jpg']
   * @returns {Promise<{ url: string, path: string, bucket: string, isSigned: boolean }>}
   */
  async uploadImage(buffer, metadata = {}) {
    const mimeType = metadata.mimeType || 'image/jpeg';
    const extension = metadata.extension || (mimeType === 'image/png' ? '.png' : '.jpg');
    const storagePath = this.generatePath(extension);

    // If Supabase is unconfigured in dry-run mode, handle gracefully
    if (!this.supabase) {
      if (this.isDryRun) {
        logger.info('[DRY_RUN] Supabase storage client not configured. Simulating local storage upload...');
        const localDir = path.resolve('.state/mock-images');
        fs.mkdirSync(localDir, { recursive: true });
        const localFilePath = path.join(localDir, path.basename(storagePath));
        fs.writeFileSync(localFilePath, buffer);

        const simulatedUrl = `https://mock-supabase.local/${this.bucket}/${storagePath}`;
        logger.info(`[DRY_RUN] Image saved locally to ${localFilePath}. Mock URL: ${simulatedUrl}`);
        return {
          url: simulatedUrl,
          path: storagePath,
          bucket: this.bucket,
          isSigned: false,
        };
      }
      throw new Error(
        'StorageService is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
      );
    }

    logger.info(
      `Uploading generated image (${buffer.length} bytes) to Supabase Storage [bucket: '${this.bucket}', path: '${storagePath}']...`
    );

    const uploadFn = async () => {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        throw new Error(`Supabase Storage upload failed: ${error.message}`);
      }

      return data;
    };

    await withRetry(uploadFn, {
      maxRetries: this.maxRetries,
      operationName: `Supabase.Storage.Upload(${storagePath})`,
    });

    logger.info(`Successfully uploaded image to Supabase Storage.`);

    // Determine public or signed URL
    let accessibleUrl;
    let isSigned = false;

    if (this.useSignedUrl) {
      // Generate a signed URL with time-to-live
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(storagePath, this.signedUrlExpiresIn);

      if (error || !data?.signedUrl) {
        throw new Error(`Failed to create Supabase signed URL: ${error?.message || 'Unknown error'}`);
      }

      accessibleUrl = data.signedUrl;
      isSigned = true;
      logger.info(
        `Generated Supabase signed URL (Expires in ${this.signedUrlExpiresIn}s).`
      );
    } else {
      // Official recommended approach for Meta: Public Bucket direct HTTPS URL
      // Meta crawlers fetch directly from clean static URLs without query-string decoding issues
      const { data } = this.supabase.storage
        .from(this.bucket)
        .getPublicUrl(storagePath);

      if (!data?.publicUrl) {
        throw new Error('Failed to retrieve Supabase public URL for uploaded object.');
      }

      accessibleUrl = data.publicUrl;
      logger.info(`Generated Supabase public storage URL.`);
    }

    // Validate URL meets Meta Instagram API constraints (HTTPS, public)
    if (!this.isDryRun) {
      const validation = validatePublicImageUrl(accessibleUrl);
      if (!validation.valid) {
        throw new Error(`Generated Supabase URL is invalid for Meta Instagram API: ${validation.error}`);
      }
    }

    return {
      url: accessibleUrl,
      path: storagePath,
      bucket: this.bucket,
      isSigned,
    };
  }
}
