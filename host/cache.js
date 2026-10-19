/** Small TTL cache and git-process limiter used by the reader. */

/**
 * @returns {{ get(key: string): unknown, set(key: string, value: unknown, ttlMs: number): void, clear(): void }}
 */
export function createCache() {
  const values = new Map();
  return {
    get(key) {
      const entry = values.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        values.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs) {
      values.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      values.clear();
    },
  };
}

/**
 * Run at most `max` jobs at a time. A queued job is skipped when its signal is
 * already aborted; a running job receives the signal from its own git call.
 * @param {number} max
 * @returns {(job: () => Promise<unknown>, signal?: AbortSignal) => Promise<unknown>}
 */
export function createLimiter(max) {
  let active = 0;
  const queue = [];

  const pump = () => {
    while (active < max && queue.length > 0) {
      const item = queue.shift();
      if (item.signal?.aborted) {
        item.reject(abortError());
        continue;
      }
      active += 1;
      Promise.resolve()
        .then(item.job)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  return (job, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      queue.push({ job, resolve, reject, signal });
      pump();
    });
}

/** @returns {Error & { code: 'aborted' }} */
export function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  error.code = 'aborted';
  return error;
}
