// js/retry.js
import { CONFIG } from "./config.js";

/**
 * Execute fn with exponential backoff retry.
 *
 * @param {() => Promise<any>} fn - Async function to retry
 * @param {{ maxAttempts?: number, baseDelay?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<any>}
 */
export async function withRetry(fn, {
  maxAttempts = CONFIG.MAX_RETRY_ATTEMPTS,
  baseDelay = CONFIG.RETRY_BASE_DELAY,
  signal,
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Do not retry on abort
      if (err.name === "AbortError") throw err;

      // Do not retry on 4xx client errors
      if (err.httpStatus && err.httpStatus >= 400 && err.httpStatus < 500) throw err;

      // No more attempts left
      if (attempt === maxAttempts) break;

      // Check abort before waiting
      if (signal?.aborted) throw new Error("Pedido cancelado.");

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200;
      await sleep(delay, signal);
    }
  }

  throw lastError;
}

/**
 * Sleep for ms milliseconds, rejecting early if signal is aborted.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("Pedido cancelado."));
    }

    const id = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(id);
        reject(new Error("Pedido cancelado."));
      }, { once: true });
    }
  });
}
