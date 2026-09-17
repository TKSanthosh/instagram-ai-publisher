import dotenv from 'dotenv';
import { registerSecrets, logger } from '../utils/logger.js';

// Load environment variables from .env file if present
dotenv.config();

/**
 * Parses boolean value from environment variable string.
 * @param {string|undefined} val
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function parseBool(val, defaultValue = false) {
  if (val === undefined || val === null || val === '') return defaultValue;
  return val.trim().toLowerCase() === 'true' || val.trim() === '1';
}

/**
 * Parses integer value from environment variable string.
 * @param {string|undefined} val
 * @param {number} defaultValue
 * @returns {number}
 */
function parseIntSafe(val, defaultValue) {
  if (val === undefined || val === null || val === '') return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validates and returns the loaded application configuration.
 * @returns {Object} Validated configuration object
 */
export function loadConfig() {
  const isDryRun = parseBool(process.env.DRY_RUN, false);

  const config = {
    dryRun: isDryRun,

    // Google Gemini Configuration (Nano Banana models)
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    },

    // Meta Instagram Graph API Configuration
    instagram: {
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
      userId: process.env.INSTAGRAM_USER_ID || '',
      apiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
    },

    // Supabase Storage Configuration
    supabase: {
      url: process.env.SUPABASE_URL || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      bucket: process.env.SUPABASE_STORAGE_BUCKET || 'instagram-images',
      useSignedUrl: parseBool(process.env.SUPABASE_USE_SIGNED_URL, false),
      signedUrlExpiresIn: parseIntSafe(process.env.SUPABASE_SIGNED_URL_EXPIRES_IN, 1800), // 30 minutes
    },

    // Post / Content Configuration
    post: {
      caption:
        process.env.POST_CAPTION ||
        'Exploring the cutting-edge intersection of AI and creativity 🚀✨ #AI #Innovation #TechFuture',
      imageWidth: parseIntSafe(process.env.IMAGE_WIDTH, 1080),
      imageHeight: parseIntSafe(process.env.IMAGE_HEIGHT, 1350),
      aspectRatio: process.env.IMAGE_ASPECT_RATIO || '4:5',
    },

    // Resilience & Timeouts
    resilience: {
      maxRetries: parseIntSafe(process.env.MAX_RETRIES, 3),
      retryDelayMs: parseIntSafe(process.env.RETRY_DELAY_MS, 1000),
      requestTimeoutMs: parseIntSafe(process.env.REQUEST_TIMEOUT_MS, 60000),
      idempotencyWindowMinutes: parseIntSafe(process.env.IDEMPOTENCY_WINDOW_MINUTES, 60),
    },

    // State persistence driver: 'local' (file), 'supabase', or 'memory'
    state: {
      driver: process.env.STATE_DRIVER || (process.env.SUPABASE_URL ? 'supabase' : 'local'),
      localFilePath: process.env.STATE_LOCAL_FILE_PATH || '.state/publisher-state.json',
      storagePath: process.env.STATE_STORAGE_PATH || 'state/publisher-state.json',
    },
  };

  // Register secrets for automatic redaction across all logger calls
  registerSecrets([
    config.gemini.apiKey,
    config.instagram.accessToken,
    config.supabase.serviceRoleKey,
  ]);

  // Validation
  const errors = [];

  // Gemini API key is always required
  if (!config.gemini.apiKey) {
    errors.push('GEMINI_API_KEY is required. Get one at https://aistudio.google.com/');
  }

  // If NOT in dry-run mode, Instagram credentials and Supabase credentials are required
  if (!isDryRun) {
    if (!config.instagram.accessToken) {
      errors.push('INSTAGRAM_ACCESS_TOKEN is required for live publishing.');
    }
    if (!config.instagram.userId) {
      errors.push('INSTAGRAM_USER_ID is required for live publishing.');
    }
    if (!config.supabase.url) {
      errors.push('SUPABASE_URL is required for Supabase Storage image upload.');
    }
    if (!config.supabase.serviceRoleKey) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY is required for Supabase Storage image upload.');
    }
  } else {
    // In dry-run mode, warn if credentials are missing but don't prevent generating the image
    if (!config.instagram.accessToken || !config.instagram.userId) {
      logger.info(
        '[DRY_RUN] Instagram credentials not provided. Real Instagram publishing will be skipped as expected.'
      );
    }
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      logger.info(
        '[DRY_RUN] Supabase credentials not provided. Storage upload will operate in simulated/local mode.'
      );
    }
  }

  if (errors.length > 0) {
    const message = `Environment configuration validation failed:\n  - ${errors.join('\n  - ')}`;
    logger.error(message);
    throw new Error(message);
  }

  return config;
}
