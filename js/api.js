// js/api.js
import { CONFIG } from "./config.js";

/**
 * Transcribe (or translate) a single audio/video file via XMLHttpRequest
 * so that upload progress can be tracked.
 *
 * @param {File} file
 * @param {{ task?: string, language?: string, signal?: AbortSignal, onProgress?: (pct: number) => void }} options
 * @returns {Promise<string>} Transcribed text
 */
export function transcribeFile(file, { task = "transcribe", language = "", model = "small", signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("audio_file", file, file.name);
    formData.append("task", task);
    if (language) formData.append("language", language);
    if (model) formData.append("model", model);

    const xhr = new XMLHttpRequest();

    // Upload progress
    if (typeof onProgress === "function") {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json.text ?? xhr.responseText);
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        const err = new Error(`Erro HTTP ${xhr.status}: ${xhr.statusText}`);
        err.httpStatus = xhr.status;
        reject(err);
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Erro de rede ao enviar o ficheiro."));
    });

    xhr.addEventListener("abort", () => {
      const err = new Error("Pedido cancelado.");
      err.name = "AbortError";
      reject(err);
    });

    xhr.open("POST", CONFIG.ASR_ENDPOINT);

    // Link AbortSignal to XHR
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        const err = new Error("Pedido cancelado.");
        err.name = "AbortError";
        reject(err);
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}

/**
 * Send transcription results via email.
 *
 * @param {string} email
 * @param {Array<{ name: string, text: string }>} results
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function sendEmail(email, results, signal) {
  const body = results
    .map(r => `=== ${r.name} ===\n${r.text}`)
    .join("\n\n");

  const formData = new FormData();
  formData.append("to", email);
  formData.append("subject", "Transcrições Whisper ASR");
  formData.append("body", body);

  const resp = await fetch(CONFIG.EMAIL_ENDPOINT, {
    method: "POST",
    body: formData,
    signal,
  });

  if (!resp.ok) {
    throw new Error(`Erro ao enviar email: ${resp.status} ${resp.statusText}`);
  }
}
