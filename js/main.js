// js/main.js
import { CONFIG } from "./config.js";
import {
  initDOM, setStatus, clearMessages, showError, showSuccess,
  setServerState, getExtension, setProgress, showProgress,
  updateWordCount, escapeHtml,
} from "./dom.js";
import { transcribeFile, sendEmail } from "./api.js";
import { withRetry } from "./retry.js";
import { buildQueue, setBadge } from "./queue.js";
import { exportAsText, exportAsSRT, exportAsVTT, exportAsJSON } from "./export.js";
import { saveTranscription, getHistory, deleteTranscription, clearHistory } from "./persistence.js";
import { initTheme, toggleTheme } from "./theme.js";
import { startHealthCheck } from "./health.js";

// ── Bootstrap ──────────────────────────────────────────────────────────────
initTheme();
const dom = initDOM();

const stopHealth = startHealthCheck(CONFIG, (state) => {
  setServerState(dom.serverDot, dom.serverLabel, state);
});

// ── State ──────────────────────────────────────────────────────────────────
/** @type {AbortController|null} */
let controller = null;

/** @type {Array<{ name: string, text: string }>} */
let results = [];

let processing = false;

// ── Theme ──────────────────────────────────────────────────────────────────
dom.themeToggle.addEventListener("click", toggleTheme);

// ── Drag & Drop ────────────────────────────────────────────────────────────
const dz = dom.dropZone;

dz.addEventListener("dragover", (e) => {
  e.preventDefault();
  dz.classList.add("drag-over");
});

["dragleave", "dragend"].forEach(evt =>
  dz.addEventListener(evt, () => dz.classList.remove("drag-over"))
);

dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("drag-over");
  if (e.dataTransfer?.files?.length) {
    dom.fileInput.files = e.dataTransfer.files;
    updateFileCount();
    showPreview(e.dataTransfer.files);
  }
});

// ── File input ─────────────────────────────────────────────────────────────
dom.fileInput.addEventListener("change", () => {
  updateFileCount();
  showPreview(dom.fileInput.files);
});

function updateFileCount() {
  const n = dom.fileInput.files?.length ?? 0;
  dom.fileCount.textContent = n > 0
    ? `${n} ficheiro${n !== 1 ? "s" : ""} selecionado${n !== 1 ? "s" : ""}`
    : "";
}

// ── Validation ─────────────────────────────────────────────────────────────
function validateInputs() {
  const files = dom.fileInput.files;
  const email = dom.emailInput.value.trim();

  if (!files || files.length === 0) {
    showError(dom.statusText, "Por favor selecione pelo menos um ficheiro.");
    return false;
  }

  if (!email) {
    showError(dom.statusText, "Por favor introduza o seu endereço de email.");
    dom.emailInput.focus();
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError(dom.statusText, "Endereço de email inválido.");
    dom.emailInput.focus();
    return false;
  }

  for (const file of files) {
    const ext = getExtension(file.name);
    if (!CONFIG.ALLOWED_EXTENSIONS.has(ext)) {
      showError(dom.statusText, `Tipo de ficheiro não suportado: "${file.name}". Extensões permitidas: ${[...CONFIG.ALLOWED_EXTENSIONS].join(", ")}`);
      return false;
    }

    if (file.size === 0) {
      showError(dom.statusText, `O ficheiro "${file.name}" está vazio.`);
      return false;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > CONFIG.MAX_FILE_SIZE_MB) {
      showError(dom.statusText, `O ficheiro "${file.name}" excede o limite de ${CONFIG.MAX_FILE_SIZE_MB} MB.`);
      return false;
    }
  }

  return true;
}

// ── Confirm modal ──────────────────────────────────────────────────────────
function showModal(message) {
  return new Promise((resolve) => {
    dom.modalMsg.textContent = message;
    dom.confirmModal.hidden = false;
    dom.modalConfirmBtn.focus();

    function onConfirm() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }

    function cleanup() {
      dom.confirmModal.hidden = true;
      dom.modalConfirmBtn.removeEventListener("click", onConfirm);
      dom.modalCancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
    }

    dom.modalConfirmBtn.addEventListener("click", onConfirm);
    dom.modalCancelBtn.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);
  });
}

// ── Process ────────────────────────────────────────────────────────────────
dom.processBtn.addEventListener("click", async () => {
  clearMessages(dom);

  if (!validateInputs()) return;

  const files = dom.fileInput.files;
  const email = dom.emailInput.value.trim();
  const task = dom.taskSelect.value;
  const model = dom.modelSelect.value;
  const language = dom.langInput.value.trim();

  const confirmed = await showModal(
    `Processar ${files.length} ficheiro${files.length !== 1 ? "s" : ""} com a tarefa "${task === "translate" ? "Traduzir para inglês" : "Transcrever"}"?`
  );
  if (!confirmed) return;

  // Setup
  processing = true;
  results = [];
  controller = new AbortController();
  const { signal } = controller;

  dom.processBtn.disabled = true;
  dom.cancelBtn.hidden = false;
  dom.outputArea.hidden = true;
  dom.exportRow.hidden = true;
  dom.spinner.hidden = false;

  buildQueue(files, dom.queueList);

  setStatus(dom.statusText, "A processar…");
  showProgress(dom, true);

  // Prevent accidental page close
  const beforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnload);

  let hadError = false;

  for (let i = 0; i < files.length; i++) {
    if (signal.aborted) break;

    const file = files[i];
    setBadge(i, "active");
    setStatus(dom.statusText, `A processar: ${file.name} (${i + 1}/${files.length})…`);
    setProgress(dom, 0);

    try {
      const text = await withRetry(
        () => transcribeFile(file, {
          task,
          language,
          model,
          signal,
          onProgress: (pct) => setProgress(dom, pct),
        }),
        { signal }
      );

      setBadge(i, "done");
      results.push({ name: file.name, text });

      // Persist to IndexedDB (best effort)
      saveTranscription({ name: file.name, text, email, task }).catch(console.error);

    } catch (err) {
      if (err.name === "AbortError") {
        // Mark remaining as error
        for (let j = i; j < files.length; j++) setBadge(j, "error");
        setStatus(dom.statusText, "Processamento cancelado.");
        hadError = true;
        break;
      }
      setBadge(i, "error");
      results.push({ name: file.name, text: `[Erro: ${err.message}]` });
      hadError = true;
    }
  }

  // Show results
  if (results.length > 0) {
    const combined = results
      .map(r => `=== ${r.name} ===\n\n${r.text}`)
      .join("\n\n---\n\n");

    dom.outputText.textContent = combined;
    updateWordCount(dom.wordCount, combined);
    dom.outputArea.hidden = false;
    dom.exportRow.hidden = false;

    if (!hadError) {
      showSuccess(dom.statusText, "Processamento concluído com sucesso!");
    }

    // Send email (best effort)
    if (!signal.aborted) {
      try {
        setStatus(dom.statusText, "A enviar resultados por email…");
        await sendEmail(email, results, signal);
        if (!hadError) {
          showSuccess(dom.statusText, `Processamento concluído! Resultados enviados para ${email}.`);
        }
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("Falha ao enviar email:", e);
        }
      }
    }

    // Refresh history panel
    loadHistory().catch(console.error);
  } else if (!hadError) {
    setStatus(dom.statusText, "Nenhum resultado obtido.");
  }

  // Cleanup
  processing = false;
  dom.processBtn.disabled = false;
  dom.cancelBtn.hidden = true;
  dom.spinner.hidden = true;
  setProgress(dom, 100);
  window.removeEventListener("beforeunload", beforeUnload);
});

// ── Cancel ─────────────────────────────────────────────────────────────────
dom.cancelBtn.addEventListener("click", () => {
  if (controller) {
    controller.abort();
    controller = null;
  }
  dom.cancelBtn.hidden = true;
});

// ── Copy ───────────────────────────────────────────────────────────────────
dom.copyBtn.addEventListener("click", async () => {
  const text = dom.outputText.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = dom.copyBtn.textContent;
    dom.copyBtn.textContent = "✓ Copiado";
    setTimeout(() => { dom.copyBtn.textContent = original; }, 1800);
  } catch {
    showError(dom.statusText, "Não foi possível copiar para a área de transferência.");
  }
});

// ── Export ─────────────────────────────────────────────────────────────────
dom.exportTxt.addEventListener("click",  () => exportAsText(results));
dom.exportSrt.addEventListener("click",  () => exportAsSRT(results));
dom.exportVtt.addEventListener("click",  () => exportAsVTT(results));
dom.exportJson.addEventListener("click", () => exportAsJSON(results));

// ── Audio / video preview ──────────────────────────────────────────────────
function revokePreviewUrl() {
  if (dom.previewPlayer?.src?.startsWith("blob:")) {
    URL.revokeObjectURL(dom.previewPlayer.src);
  }
}

function showPreview(files) {
  if (!dom.previewArea || !dom.previewPlayer || !files || files.length === 0) return;

  // Only preview the first selected file
  const file = files[0];
  revokePreviewUrl();
  dom.previewPlayer.src = URL.createObjectURL(file);
  dom.previewArea.hidden = false;
}

// ── History ────────────────────────────────────────────────────────────────
/**
 * Render history items from IndexedDB.
 */
async function loadHistory() {
  try {
    const items = await getHistory();
    dom.historyList.innerHTML = "";

    if (items.length === 0) {
      dom.historyEmpty.hidden = false;
      dom.clearHistoryBtn.hidden = true;
      return;
    }

    dom.historyEmpty.hidden = true;
    dom.clearHistoryBtn.hidden = false;

    items.forEach((item) => {
      const date = new Date(item.timestamp).toLocaleString("pt-PT");
      const preview = item.text.replace(/\n/g, " ").slice(0, 120);
      const li = document.createElement("li");
      li.className = "history-item";
      li.dataset.id = item.id;
      li.innerHTML = `
        <div class="history-meta">
          <span class="history-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <span class="history-date">${escapeHtml(date)}</span>
        </div>
        <p class="history-preview">${escapeHtml(preview)}${item.text.length > 120 ? "…" : ""}</p>
        <div class="history-actions">
          <button type="button" class="btn-history-view" data-id="${item.id}" aria-label="Ver transcrição de ${escapeHtml(item.name)}">Ver</button>
          <button type="button" class="btn-history-delete" data-id="${item.id}" aria-label="Eliminar transcrição de ${escapeHtml(item.name)}">✕</button>
        </div>
      `;
      dom.historyList.appendChild(li);
    });

    // View button
    dom.historyList.querySelectorAll(".btn-history-view").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const item = items.find(r => r.id === id);
        if (!item) return;
        results = [{ name: item.name, text: item.text }];
        const combined = `=== ${item.name} ===\n\n${item.text}`;
        dom.outputText.textContent = combined;
        updateWordCount(dom.wordCount, combined);
        dom.outputArea.hidden = false;
        dom.exportRow.hidden = false;
        dom.outputArea.scrollIntoView({ behavior: "smooth" });
      });
    });

    // Delete button
    dom.historyList.querySelectorAll(".btn-history-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        try {
          await deleteTranscription(id);
          await loadHistory();
        } catch (e) {
          console.error("Erro ao eliminar:", e);
        }
      });
    });
  } catch (e) {
    console.error("Erro ao carregar histórico:", e);
  }
}

dom.clearHistoryBtn.addEventListener("click", async () => {
  try {
    await clearHistory();
    await loadHistory();
  } catch (e) {
    console.error("Erro ao limpar histórico:", e);
  }
});

// Initial history load
loadHistory().catch(console.error);

// ── Unload cleanup ─────────────────────────────────────────────────────────
window.addEventListener("unload", () => {
  stopHealth();
  if (controller) controller.abort();
  revokePreviewUrl();
});
