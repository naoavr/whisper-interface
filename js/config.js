// js/config.js
export const CONFIG = Object.freeze({
  WHISPER_API_BASE: "http://10.0.1.250:9000",
  ASR_ENDPOINT: "proxy.php",
  EMAIL_ENDPOINT: "send-email.php",
  MAX_FILE_SIZE_MB: 500,
  HEALTH_INTERVAL: 30_000,
  HEALTH_TIMEOUT: 3_000,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000,
  ALLOWED_EXTENSIONS: new Set([
    "mp3", "wav", "ogg", "flac", "m4a", "wma", "aac",
    "mp4", "webm", "mkv", "avi", "mov",
  ]),
});
