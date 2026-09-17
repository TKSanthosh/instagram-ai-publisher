/**
 * Validates whether a given URL is a valid, publicly accessible HTTPS URL.
 * Meta's Instagram API explicitly rejects non-HTTPS or localhost URLs.
 * @param {string} urlString
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePublicImageUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'Image URL must be a non-empty string.' };
  }

  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Image URL protocol must be HTTPS (received: ${parsed.protocol}). Instagram API requires secure HTTPS URLs.`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return {
        valid: false,
        error: `Image URL must be publicly accessible on the internet. Hostname '${hostname}' cannot be reached by Meta servers.`,
      };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Invalid URL format: ${err.message}` };
  }
}

/**
 * Validates image buffer metadata against Meta's Instagram Content Publishing constraints.
 * Meta guidelines:
 * - Format: JPEG (recommended and required for photos)
 * - Maximum file size: 8 MB
 * - Aspect ratio: between 4:5 (0.8) and 1.91:1 (1.91)
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {string} [options.mimeType]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateImageForInstagram(buffer, options = {}) {
  const errors = [];

  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, errors: ['Image data must be a valid Buffer.'] };
  }

  const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
  if (buffer.length > MAX_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    errors.push(`Image file size (${sizeMb} MB) exceeds Meta's 8 MB limit.`);
  }

  if (buffer.length < 100) {
    errors.push('Image buffer is too small to be a valid image file.');
  }

  if (options.mimeType) {
    const allowedMime = ['image/jpeg', 'image/jpg'];
    if (!allowedMime.includes(options.mimeType.toLowerCase())) {
      errors.push(
        `MIME type '${options.mimeType}' is not supported by Meta Instagram Photo API (must be image/jpeg).`
      );
    }
  }

  if (options.width && options.height) {
    const ratio = options.width / options.height;
    // Allowed range: 4:5 (0.80) to 1.91:1 (1.91)
    const MIN_RATIO = 4 / 5 - 0.05; // ~0.75 margin
    const MAX_RATIO = 1.91 + 0.05; // ~1.96 margin

    if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
      errors.push(
        `Aspect ratio (${ratio.toFixed(2)}) is outside Meta's allowed range (4:5 [0.80] to 1.91:1). Target dimensions: ${options.width}x${options.height}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a prompt string for image generation.
 * @param {string} prompt
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { valid: false, error: 'Prompt must be a non-empty string.' };
  }
  if (prompt.trim().length < 5) {
    return { valid: false, error: 'Prompt is too short (minimum 5 characters).' };
  }
  return { valid: true };
}
