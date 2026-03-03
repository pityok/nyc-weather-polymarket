export type FetchRetryConfig = {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const RETRY_OPEN_METEO: FetchRetryConfig = {
  timeoutMs: 10_000,
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

export const RETRY_POLYMARKET: FetchRetryConfig = {
  timeoutMs: 10_000,
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

export const RETRY_OPENROUTER: FetchRetryConfig = {
  timeoutMs: 30_000,
  maxRetries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function calcDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.2 * exponential;
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type KnownError = Error & { retryable?: boolean };

/**
 * Fetch with timeout, exponential backoff retries, and retryable/non-retryable error classification.
 *
 * Non-retryable: 4xx (except 429), explicit retryable=false errors.
 * Retryable: 429, 5xx, network errors, timeouts.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: FetchRetryConfig,
): Promise<Response> {
  let lastError: Error = new Error("fetchWithRetry: no attempts");

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return res;

      if (!isRetryableStatus(res.status)) {
        throw Object.assign(new Error(`HTTP ${res.status} (non-retryable)`), { retryable: false });
      }

      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      const e: KnownError = err instanceof Error ? err : new Error(String(err));

      if (e.retryable === false) {
        throw e;
      }

      if (e.name === "AbortError") {
        lastError = new Error(`Timeout after ${config.timeoutMs}ms`);
      } else {
        lastError = e;
      }
    }

    if (attempt < config.maxRetries) {
      const delay = calcDelay(attempt, config.baseDelayMs, config.maxDelayMs);
      console.warn(
        `[fetchWithRetry] attempt ${attempt + 1}/${config.maxRetries + 1} failed for ${url}: ${lastError.message}. Retrying in ${Math.round(delay)}ms`,
      );
      await sleep(delay);
    }
  }

  throw new Error(`${lastError.message} (after ${config.maxRetries + 1} attempt(s))`);
}
