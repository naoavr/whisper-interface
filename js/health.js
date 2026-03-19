// js/health.js
import { CONFIG } from "./config.js";

/**
 * Start periodic health checks for the Whisper ASR server.
 *
 * @param {typeof CONFIG} config
 * @param {(state: "online"|"offline"|"unknown") => void} setStateFn
 * @returns {() => void} Cleanup function that stops the health check
 */
export function startHealthCheck(config, setStateFn) {
  let timerId = null;

  async function check() {
    try {
      await fetch(config.WHISPER_API_BASE, {
        method: "GET",
        mode: "no-cors",
        signal: AbortSignal.timeout(config.HEALTH_TIMEOUT),
      });
      // no-cors fetch succeeds (opaque response) → server is reachable
      setStateFn("online");
    } catch {
      setStateFn("offline");
    }
  }

  // Immediate check
  check();

  // Periodic checks
  timerId = setInterval(check, config.HEALTH_INTERVAL);

  return function stopHealthCheck() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };
}
