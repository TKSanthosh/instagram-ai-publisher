import { logger } from './logger.js';

/**
 * Determines whether an error is transient and safe to retry.
 * @param {any} error
 * @returns {boolean}
 */
export function isTransientError(error) {
  if (!error) return false;

  // HTTP status checks
  const status = error.statusCode || error.status || (error.response && error.response.status);
  if (status) {
    // 429 Too Many Requests
    if (status === 429) return true;
    // 5xx Server Errors (500, 502, 503, 504)
    if (status >= 500 && status <= 599) return true;
    // 4xx client errors are fatal and shouldn't be retried
    if (status >= 400 && status < 500) return false;
  }

  // Network / connection errors
  const code = error.code || error.cause?.code;
  const transientNetworkCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ];
  if (code && transientNetworkCodes.includes(code)) {
    return true;
  }

  // Fetch timeout / abort errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }

  const message = (error.message || '').toLowerCase();
  if (
    message.includes('rate limit') ||
    message.includes('timeout') ||
    message.includes('service unavailable') ||
    message.includes('internal server error') ||
    message.includes('fetch failed')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculates exponential backoff delay with random jitter.
 * @param {number} attempt Current attempt number (0-indexed)
 * @param {number} baseDelay Base delay in ms
 * @param {number} maxDelay Maximum delay cap in ms
 * @returns {number}
 */
export function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Retries an asynchronous function with exponential backoff on transient errors.
 * @template T
 * @param {() => Promise<T>} fn Async function to execute
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3] Maximum number of retry attempts
 * @param {number} [options.baseDelay=1000] Initial delay in ms
 * @param {number} [options.maxDelay=30000] Maximum delay in ms
 * @param {string} [options.operationName='Operation'] Label for log messages
 * @param {(err: any) => boolean} [options.shouldRetry=isTransientError] Custom error predicate
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    operationName = 'Operation',
    shouldRetry = isTransientError,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries) {
        logger.error(`[${operationName}] Failed after ${maxRetries} retries.`, {
          error: err.message,
        });
        break;
      }

      const retryable = shouldRetry(err);
      if (!retryable) {
        logger.warn(
          `[${operationName}] Non-retryable error encountered: ${err.message}. Aborting retries.`,
          { status: err.statusCode || err.status }
        );
        break;
      }

      const delay = calculateBackoff(attempt, baseDelay, maxDelay);
      logger.warn(
        `[${operationName}] Transient failure on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${Math.round(delay)}ms...`,
        { error: err.message }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
