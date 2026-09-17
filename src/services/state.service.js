import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Local file state store for publication history and idempotency.
 */
export class LocalFileStateStore {
  constructor(filePath = '.state/publisher-state.json') {
    this.filePath = path.resolve(filePath);
  }

  async read() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { history: [], lastRun: null };
      }
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      logger.warn(`Could not read local state file: ${err.message}. Initializing empty state.`);
      return { history: [], lastRun: null };
    }
  }

  async write(state) {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      logger.error(`Failed to write local state file: ${err.message}`);
    }
  }
}

/**
 * Supabase Storage State Store that persists publication state directly in the Supabase bucket.
 * Solves the ephemeral runner limitation in GitHub Actions without requiring an external database.
 */
export class SupabaseStateStore {
  /**
   * @param {Object} options
   * @param {any} options.supabaseClient Initialized Supabase client
   * @param {string} options.bucket
   * @param {string} [options.storagePath='state/publisher-state.json']
   */
  constructor(options) {
    this.supabase = options.supabaseClient;
    this.bucket = options.bucket;
    this.storagePath = options.storagePath || 'state/publisher-state.json';
  }

  async read() {
    if (!this.supabase || !this.bucket) {
      return { history: [], lastRun: null };
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .download(this.storagePath);

      if (error) {
        logger.info(`No existing state file found in Supabase Storage. Initializing fresh state.`);
        return { history: [], lastRun: null };
      }

      const text = await data.text();
      return JSON.parse(text);
    } catch (err) {
      logger.warn(`Could not parse Supabase state: ${err.message}. Initializing fresh state.`);
      return { history: [], lastRun: null };
    }
  }

  async write(state) {
    if (!this.supabase || !this.bucket) {
      return;
    }

    try {
      const payload = Buffer.from(JSON.stringify(state, null, 2), 'utf8');
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(this.storagePath, payload, {
          contentType: 'application/json',
          upsert: true,
        });

      if (error) {
        logger.error(`Failed to write Supabase state: ${error.message}`);
      } else {
        logger.info(`Persisted state successfully to Supabase Storage [${this.bucket}/${this.storagePath}].`);
      }
    } catch (err) {
      logger.error(`Failed to upload Supabase state: ${err.message}`);
    }
  }
}

/**
 * Memory State Store for testing.
 */
export class MemoryStateStore {
  constructor(initialState = { history: [], lastRun: null }) {
    this.state = initialState;
  }

  async read() {
    return this.state;
  }

  async write(state) {
    this.state = state;
  }
}

/**
 * State Manager managing publication idempotency and execution records.
 */
export class StateService {
  /**
   * @param {LocalFileStateStore|SupabaseStateStore|MemoryStateStore} store
   * @param {Object} [options]
   * @param {number} [options.idempotencyWindowMinutes=60]
   */
  constructor(store, options = {}) {
    this.store = store;
    this.idempotencyWindowMinutes = options.idempotencyWindowMinutes || 60;
  }

  /**
   * Factory helper to instantiate the appropriate store.
   * @param {Object} config Application config
   * @param {any} [storageService]
   * @returns {StateService}
   */
  static create(config, storageService) {
    let store;

    if (config.state?.driver === 'supabase' && storageService?.supabase && config.supabase?.bucket) {
      logger.info(
        `Using SupabaseStateStore (${config.supabase.bucket}/${config.state.storagePath}) for cross-runner persistence.`
      );
      store = new SupabaseStateStore({
        supabaseClient: storageService.supabase,
        bucket: config.supabase.bucket,
        storagePath: config.state.storagePath,
      });
    } else {
      logger.info(`Using LocalFileStateStore (${config.state?.localFilePath || '.state/publisher-state.json'}).`);
      store = new LocalFileStateStore(config.state?.localFilePath);
    }

    return new StateService(store, {
      idempotencyWindowMinutes: config.resilience?.idempotencyWindowMinutes || 60,
    });
  }

  /**
   * Checks if an identical prompt was published recently within the idempotency window.
   * @param {string} promptHash SHA-256 fingerprint of the prompt
   * @returns {Promise<{ isDuplicate: boolean, lastPublished?: Object }>}
   */
  async checkDuplicate(promptHash) {
    const state = await this.store.read();
    if (!state.history || state.history.length === 0) {
      return { isDuplicate: false };
    }

    const now = Date.now();
    const windowMs = this.idempotencyWindowMinutes * 60 * 1000;

    // Look for matching prompt within the window
    for (const entry of state.history) {
      if (entry.promptHash === promptHash) {
        const entryTime = new Date(entry.timestamp).getTime();
        if (now - entryTime < windowMs) {
          return {
            isDuplicate: true,
            lastPublished: entry,
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Records a successfully published post.
   * @param {Object} record
   * @param {string} record.executionId
   * @param {string} record.mediaId
   * @param {string} record.promptHash
   * @param {string} record.imageUrl
   * @param {string} [record.prompt]
   * @param {boolean} [record.isDryRun]
   */
  async recordPublication(record) {
    const state = await this.store.read();
    if (!state.history) {
      state.history = [];
    }

    const newEntry = {
      ...record,
      timestamp: new Date().toISOString(),
    };

    state.history.unshift(newEntry);

    // Keep history capped at 100 entries
    if (state.history.length > 100) {
      state.history = state.history.slice(0, 100);
    }

    state.lastRun = newEntry;

    await this.store.write(state);
    logger.info('Publication state recorded successfully.', {
      executionId: record.executionId,
      mediaId: record.mediaId,
    });
  }
}
