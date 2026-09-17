/**
 * Structured logger with automatic secret masking and pipeline stage tracking.
 */

// List of potential secret strings to sanitize if registered
const registeredSecrets = new Set();

/**
 * Register secret values to ensure they are masked in all log outputs.
 * @param {string|Array<string>} secrets
 */
export function registerSecrets(secrets) {
  const secretList = Array.isArray(secrets) ? secrets : [secrets];
  for (const secret of secretList) {
    if (secret && typeof secret === 'string' && secret.length > 4) {
      registeredSecrets.add(secret);
    }
  }
}

/**
 * Sanitize strings to remove tokens, API keys, and registered secrets.
 * @param {string} text
 * @returns {string}
 */
export function maskSecrets(text) {
  if (typeof text !== 'string') {
    return text;
  }

  let sanitized = text;

  // Mask known registered secret strings
  for (const secret of registeredSecrets) {
    if (sanitized.includes(secret)) {
      sanitized = sanitized.split(secret).join('[REDACTED]');
    }
  }

  // Generic patterns:
  // 1. Google API keys (typically AIzaSy...)
  sanitized = sanitized.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
  // 2. Query parameters key=...
  sanitized = sanitized.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED_API_KEY]');
  // 3. Meta / Instagram access tokens (e.g. EAAB..., EAAC...)
  sanitized = sanitized.replace(/EAA[0-9A-Za-z]+/g, '[REDACTED_ACCESS_TOKEN]');
  // 4. Bearer tokens in headers
  sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9-_.]+/gi, '$1[REDACTED_TOKEN]');
  // 5. AWS secret access keys (typically 40 char base64-like)
  sanitized = sanitized.replace(/(aws_secret_access_key["']?\s*[:=]\s*["']?)[A-Za-z0-9/+=]{40}(["']?)/gi, '$1[REDACTED_SECRET]$2');

  return sanitized;
}

/**
 * Formats data for safe log printing.
 * @param {unknown} data
 * @returns {string}
 */
function formatData(data) {
  if (data === undefined || data === null) {
    return '';
  }
  if (typeof data === 'string') {
    return maskSecrets(data);
  }
  if (data instanceof Error) {
    const errorDetails = {
      message: data.message,
      name: data.name,
      stack: data.stack,
      ...(data.response ? { response: data.response } : {}),
      ...(data.statusCode ? { statusCode: data.statusCode } : {}),
    };
    return maskSecrets(JSON.stringify(errorDetails, null, 2));
  }
  try {
    return maskSecrets(JSON.stringify(data));
  } catch {
    return maskSecrets(String(data));
  }
}

function writeLog(level, message, meta) {
  const timestamp = new Date().toISOString();
  const formattedMeta = meta !== undefined ? ` ${formatData(meta)}` : '';
  const sanitizedMessage = maskSecrets(message);
  const logLine = `[${timestamp}] [${level}] ${sanitizedMessage}${formattedMeta}`;

  if (level === 'ERROR') {
    console.error(logLine);
  } else if (level === 'WARN') {
    console.warn(logLine);
  } else {
    console.log(logLine);
  }
}

export const logger = {
  info: (message, meta) => writeLog('INFO', message, meta),
  warn: (message, meta) => writeLog('WARN', message, meta),
  error: (message, meta) => writeLog('ERROR', message, meta),
  debug: (message, meta) => {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      writeLog('DEBUG', message, meta);
    }
  },
  stage: (stageName, details) => {
    const banner = `=== [STAGE: ${stageName}] ===`;
    writeLog('INFO', banner, details);
  },
  registerSecrets,
  maskSecrets,
};
