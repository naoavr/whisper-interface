// js/dom.js

/**
 * Initialise and return references to all relevant DOM elements.
 * @returns {Object} DOM element map
 */
export function initDOM() {
  return {
    emailInput:      document.getElementById("email"),
    dropZone:        document.getElementById("drop-zone"),
    fileInput:       document.getElementById("file-input"),
    fileCount:       document.getElementById("file-count"),
    taskSelect:      document.getElementById("task"),
    langInput:       document.getElementById("language"),
    processBtn:      document.getElementById("process-btn"),
    cancelBtn:       document.getElementById("cancel-btn"),
    statusText:      document.getElementById("status-text"),
    spinner:         document.getElementById("spinner"),
    progressWrap:    document.getElementById("progress-wrap"),
    progressBar:     document.getElementById("progress-bar"),
    queueList:       document.getElementById("queue-list"),
    outputArea:      document.getElementById("output-area"),
    outputText:      document.getElementById("output-text"),
    copyBtn:         document.getElementById("copy-btn"),
    exportRow:       document.getElementById("export-row"),
    exportTxt:       document.getElementById("export-txt"),
    exportSrt:       document.getElementById("export-srt"),
    exportJson:      document.getElementById("export-json"),
    serverDot:       document.getElementById("server-dot"),
    serverLabel:     document.getElementById("server-label"),
    themeToggle:     document.getElementById("theme-toggle"),
    confirmModal:    document.getElementById("confirm-modal"),
    modalMsg:        document.getElementById("modal-msg"),
    modalConfirmBtn: document.getElementById("modal-confirm"),
    modalCancelBtn:  document.getElementById("modal-cancel"),
  };
}

/**
 * Set status message with optional type.
 * @param {HTMLElement} el
 * @param {string} msg
 * @param {""|"error"|"success"} [type=""]
 */
export function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = "status-text" + (type ? ` ${type}` : "");
}

/** Clear status and progress. */
export function clearMessages(dom) {
  setStatus(dom.statusText, "");
  showProgress(dom, false);
  setProgress(dom, 0);
}

/**
 * Show an error message in the status area.
 * @param {HTMLElement} el
 * @param {string} msg
 */
export function showError(el, msg) {
  setStatus(el, msg, "error");
}

/**
 * Show a success message in the status area.
 * @param {HTMLElement} el
 * @param {string} msg
 */
export function showSuccess(el, msg) {
  setStatus(el, msg, "success");
}

/**
 * Update server indicator state.
 * @param {HTMLElement} dot
 * @param {HTMLElement} label
 * @param {"online"|"offline"|"unknown"} state
 */
export function setServerState(dot, label, state) {
  dot.className = "server-dot";
  if (state === "online") {
    dot.classList.add("online");
    label.textContent = "Servidor online";
  } else if (state === "offline") {
    dot.classList.add("offline");
    label.textContent = "Servidor offline";
  } else {
    label.textContent = "A verificar servidor…";
  }
}

/**
 * Format byte size to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Get lowercase extension from a filename.
 * @param {string} name
 * @returns {string}
 */
export function getExtension(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.at(-1).toLowerCase() : "";
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Set progress bar width (0-100).
 * @param {Object} dom
 * @param {number} pct
 */
export function setProgress(dom, pct) {
  dom.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

/**
 * Show or hide the progress bar.
 * @param {Object} dom
 * @param {boolean} visible
 */
export function showProgress(dom, visible) {
  dom.progressWrap.hidden = !visible;
}
