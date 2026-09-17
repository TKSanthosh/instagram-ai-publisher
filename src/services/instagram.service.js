import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { validatePublicImageUrl } from '../utils/validation.js';

/**
 * Meta Instagram Content Publishing Service.
 * Implements official Graph API v22.0 media container creation and publishing.
 */
export class InstagramService {
  /**
   * @param {Object} options
   * @param {string} options.accessToken Meta Instagram User Access Token
   * @param {string} options.userId Meta Instagram Professional Account ID
   * @param {string} [options.apiVersion='v22.0']
   * @param {string} [options.baseUrl='https://graph.facebook.com']
   * @param {number} [options.maxRetries=3]
   * @param {number} [options.timeoutMs=30000]
   */
  constructor(options = {}) {
    this.accessToken = options.accessToken || '';
    this.userId = options.userId || '';
    this.apiVersion = options.apiVersion || 'v22.0';

    // Auto-detect API host: Instagram User Access Tokens (starting with IG) use graph.instagram.com
    const defaultHost = this.accessToken.startsWith('IG')
      ? 'https://graph.instagram.com'
      : 'https://graph.facebook.com';

    this.baseUrl = options.baseUrl || process.env.INSTAGRAM_API_BASE_URL || defaultHost;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.timeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Internal helper for calling Meta Graph API endpoints.
   * @param {string} endpoint e.g. `/${this.apiVersion}/${this.userId}/media`
   * @param {string} method HTTP method ('GET' | 'POST')
   * @param {Record<string, any>} [params={}]
   * @returns {Promise<any>}
   */
  async request(endpoint, method = 'GET', params = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${this.baseUrl}${cleanEndpoint}`);

    // Always include access token
    const allParams = { ...params, access_token: this.accessToken };

    let fetchOptions = {
      method,
      headers: {
        Accept: 'application/json',
      },
    };

    if (method === 'GET') {
      for (const [key, value] of Object.entries(allParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    } else {
      const bodyParams = new URLSearchParams();
      for (const [key, value] of Object.entries(allParams)) {
        if (value !== undefined && value !== null) {
          bodyParams.append(key, String(value));
        }
      }
      fetchOptions = {
        ...fetchOptions,
        body: bodyParams.toString(),
        headers: {
          ...fetchOptions.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        ...fetchOptions,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        const errorInfo = data.error || {};
        const err = new Error(
          `Meta Graph API Error [${errorInfo.code || response.status}]: ${
            errorInfo.message || response.statusText
          }${errorInfo.error_subcode ? ` (Subcode: ${errorInfo.error_subcode})` : ''}`
        );
        err.statusCode = response.status;
        err.metaError = errorInfo;
        throw err;
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validates credentials and verifies that the Instagram account is reachable.
   * @returns {Promise<{ id: string, username?: string, name?: string }>}
   */
  async getInstagramAccount() {
    if (!this.accessToken || !this.userId) {
      throw new Error('InstagramService requires accessToken and userId.');
    }

    logger.info(`Verifying Instagram account with Graph API ${this.apiVersion}...`, {
      userId: this.userId,
    });

    const verifyCall = async () => {
      return await this.request(`/${this.apiVersion}/${this.userId}`, 'GET', {
        fields: 'id,username,name',
      });
    };

    const data = await withRetry(verifyCall, {
      maxRetries: this.maxRetries,
      operationName: 'Instagram.getInstagramAccount',
    });

    logger.info('Instagram account verified successfully.', {
      id: data.id,
      username: data.username || '[private]',
    });

    return data;
  }

  /**
   * Creates a media container for an image post.
   * Meta Endpoint: POST /{ig-user-id}/media
   * @param {string} imageUrl Must be a public HTTPS URL accessible to Meta
   * @param {string} [caption] Caption text
   * @returns {Promise<{ id: string }>} Container creation ID
   */
  async createMediaContainer(imageUrl, caption = '') {
    const urlValidation = validatePublicImageUrl(imageUrl);
    if (!urlValidation.valid) {
      throw new Error(`Invalid image URL for Instagram media container: ${urlValidation.error}`);
    }

    logger.info('Creating Instagram media container...', {
      userId: this.userId,
      captionLength: caption ? caption.length : 0,
    });

    const createCall = async () => {
      const payload = {
        image_url: imageUrl,
      };

      if (caption && caption.trim().length > 0) {
        payload.caption = caption.trim();
      }

      return await this.request(`/${this.apiVersion}/${this.userId}/media`, 'POST', payload);
    };

    const data = await withRetry(createCall, {
      maxRetries: this.maxRetries,
      operationName: 'Instagram.createMediaContainer',
    });

    logger.info(`Instagram media container created with ID: ${data.id}`);
    return data;
  }

  /**
   * Checks the processing status of a media container.
   * Meta Endpoint: GET /{container-id}?fields=status_code,status
   * Status code can be: FINISHED, IN_PROGRESS, ERROR, EXPIRED
   * @param {string} containerId
   * @returns {Promise<{ id: string, status_code: string, status?: string }>}
   */
  async getMediaStatus(containerId) {
    if (!containerId) {
      throw new Error('containerId is required to check media status.');
    }

    const checkCall = async () => {
      return await this.request(`/${this.apiVersion}/${containerId}`, 'GET', {
        fields: 'status_code,status',
      });
    };

    return await withRetry(checkCall, {
      maxRetries: this.maxRetries,
      operationName: `Instagram.getMediaStatus(${containerId})`,
    });
  }

  /**
   * Polls a media container until processing is FINISHED or throws on ERROR/timeout.
   * Note: Single photos are often FINISHED immediately, but polling guarantees safety.
   * @param {string} containerId
   * @param {Object} [options]
   * @param {number} [options.maxWaitMs=60000] Maximum total wait time
   * @param {number} [options.intervalMs=2500] Polling interval
   * @returns {Promise<void>}
   */
  async waitForMediaContainerReady(containerId, options = {}) {
    const maxWaitMs = options.maxWaitMs || 60000;
    const intervalMs = options.intervalMs || 2500;
    const startTime = Date.now();

    logger.info(`Checking container status for ID: ${containerId}...`);

    while (Date.now() - startTime < maxWaitMs) {
      const statusData = await this.getMediaStatus(containerId);
      const code = statusData.status_code;

      if (code === 'FINISHED') {
        logger.info(`Media container ${containerId} is ready for publishing.`);
        return;
      }

      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new Error(
          `Media container processing failed with status: ${code}. Details: ${
            statusData.status || 'No further details'
          }`
        );
      }

      logger.info(`Media container ${containerId} status is '${code || 'PROCESSING'}'. Waiting ${intervalMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timed out waiting for media container ${containerId} to finish processing.`);
  }

  /**
   * Publishes the media container to the Instagram feed.
   * Meta Endpoint: POST /{ig-user-id}/media_publish
   * @param {string} containerId
   * @returns {Promise<{ id: string }>} Published Instagram Media ID
   */
  async publishMedia(containerId) {
    if (!containerId) {
      throw new Error('containerId is required to publish media.');
    }

    logger.info(`Publishing media container ${containerId} to Instagram...`);

    const publishCall = async () => {
      return await this.request(`/${this.apiVersion}/${this.userId}/media_publish`, 'POST', {
        creation_id: containerId,
      });
    };

    const data = await withRetry(publishCall, {
      maxRetries: this.maxRetries,
      operationName: `Instagram.publishMedia(${containerId})`,
    });

    logger.info(`Successfully published to Instagram! Media ID: ${data.id}`);
    return data;
  }
}
