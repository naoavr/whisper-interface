// js/workers.js

import { escapeHtml } from "./dom.js";

const WORKERS_KEY = "whisper-workers";

/**
 * Generate a cryptographically random hex token.
 * @param {number} [bytes=16]
 * @returns {string}
 */
function generateToken(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a unique ID (UUID v4 when available, random hex otherwise).
 * @returns {string}
 */
function generateId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return generateToken(16);
}

/**
 * Load all registered workers from localStorage.
 * @returns {Array<{id: string, name: string, url: string, token: string, createdAt: number, status: string}>}
 */
export function getWorkers() {
  try {
    return JSON.parse(localStorage.getItem(WORKERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Persist the workers array to localStorage.
 * @param {Array} workers
 */
function saveWorkers(workers) {
  localStorage.setItem(WORKERS_KEY, JSON.stringify(workers));
}

/**
 * Add a new worker and return it.
 * @param {string} name
 * @param {string} url
 * @returns {{id: string, name: string, url: string, token: string, createdAt: number, status: string}}
 */
export function addWorker(name, url) {
  const workers = getWorkers();
  const worker = {
    id: generateId(),
    name: name.trim(),
    url: url.trim().replace(/\/+$/, ""),
    token: generateToken(16),
    createdAt: Date.now(),
    status: "unknown",
  };
  workers.push(worker);
  saveWorkers(workers);
  return worker;
}

/**
 * Remove a worker by id.
 * @param {string} id
 */
export function removeWorker(id) {
  saveWorkers(getWorkers().filter(w => w.id !== id));
}

/**
 * Update a worker's status in localStorage.
 * @param {string} id
 * @param {"online"|"offline"|"unknown"} status
 */
export function setWorkerStatus(id, status) {
  saveWorkers(getWorkers().map(w => w.id === id ? { ...w, status } : w));
}

/**
 * Check the health of a single worker via a no-cors probe.
 * @param {{id: string, url: string}} worker
 * @param {number} [timeout=3000]
 * @returns {Promise<boolean>}
 */
export async function checkWorkerHealth(worker, timeout = 3000) {
  try {
    await fetch(worker.url, {
      method: "GET",
      mode: "no-cors",
      signal: AbortSignal.timeout(timeout),
    });
    setWorkerStatus(worker.id, "online");
    return true;
  } catch {
    setWorkerStatus(worker.id, "offline");
    return false;
  }
}

/**
 * Return only the workers whose last known status is "online".
 * @returns {Array}
 */
export function getOnlineWorkers() {
  return getWorkers().filter(w => w.status === "online");
}

/**
 * Pick the next worker for load balancing (round-robin).
 * @param {Array} workers
 * @param {number} index  Current round-robin index
 * @returns {{worker: object|null, nextIndex: number}}
 */
export function pickWorker(workers, index) {
  if (!workers.length) return { worker: null, nextIndex: 0 };
  const worker = workers[index % workers.length];
  return { worker, nextIndex: (index + 1) % workers.length };
}

/**
 * Generate the Bash integration script for a worker.
 * @param {{id: string, name: string, token: string}} worker
 * @param {string|number} [port=9000]
 * @returns {string}
 */
export function generateIntegrationScript(worker, port = 9000) {
  const date = new Date().toLocaleString("pt-PT");
  const containerName = `whisper-worker-${worker.id.slice(0, 8)}`;
  return `#!/usr/bin/env bash
# =================================================================
# Script de Integração do Trabalhador Whisper ASR
# =================================================================
# Gerado em:   ${date}
# Trabalhador: ${worker.name}
# Token:       ${worker.token}
# ID:          ${worker.id}
#
# Este script instala e inicia o serviço Whisper ASR neste
# computador, tornando-o disponível para processamento distribuído.
#
# Requisitos: Docker  https://docs.docker.com/get-docker/
# =================================================================

set -e

WORKER_PORT="${port}"
CONTAINER_NAME="${containerName}"

echo "🔧 A configurar trabalhador Whisper ASR: ${worker.name}"
echo ""

# Verificar se o Docker está instalado
if ! command -v docker &> /dev/null; then
  echo "❌ Docker não encontrado."
  echo "   Instale o Docker: https://docs.docker.com/get-docker/"
  exit 1
fi

echo "✅ Docker encontrado."

# Remover contêiner existente com o mesmo nome (se existir)
if docker ps -a --format '{{.Names}}' | grep -qx "\${CONTAINER_NAME}"; then
  echo "🔄 A remover contêiner anterior..."
  docker rm -f "\${CONTAINER_NAME}" > /dev/null
fi

echo "📦 A iniciar serviço Whisper ASR (porta \${WORKER_PORT})..."

docker run -d \\
  --name "\${CONTAINER_NAME}" \\
  --restart unless-stopped \\
  -p "\${WORKER_PORT}:9000" \\
  -e ASR_MODEL=small \\
  -e ASR_ENGINE=openai_whisper \\
  -e CORS_ORIGINS='["*"]' \\
  onerahmet/openai-whisper-asr-webservice:latest

echo ""
echo "✅ Serviço iniciado com sucesso!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
LOCAL_IP=\$(hostname -I 2>/dev/null | awk '{print \$1}' || echo "IP_DO_COMPUTADOR")
echo "   Adicione este trabalhador na interface web com o URL:"
echo "   http://\${LOCAL_IP}:\${WORKER_PORT}"
echo ""
echo "   (Aguarde ~1 minuto enquanto o modelo é carregado)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
`;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Render the workers list into the given <ul> element.
 * @param {HTMLUListElement} listEl
 * @param {HTMLParagraphElement} emptyEl
 * @param {Function} onRemove  Callback(id: string)
 */
export function renderWorkers(listEl, emptyEl, onRemove) {
  const workers = getWorkers();
  listEl.innerHTML = "";

  if (workers.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  workers.forEach((w) => {
    const li = document.createElement("li");
    li.className = "worker-item";
    li.dataset.id = w.id;

    const statusClass = w.status === "online"  ? "worker-dot--online"
                      : w.status === "offline" ? "worker-dot--offline"
                      : "worker-dot--unknown";
    const statusLabel = w.status === "online"  ? "Online"
                      : w.status === "offline" ? "Offline"
                      : "A verificar…";

    li.innerHTML = `
      <span class="worker-dot ${escapeHtml(statusClass)}" aria-hidden="true"></span>
      <div class="worker-info">
        <span class="worker-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</span>
        <span class="worker-url">${escapeHtml(w.url)}</span>
      </div>
      <span class="worker-status-label">${escapeHtml(statusLabel)}</span>
      <button
        type="button"
        class="btn-worker-remove"
        data-id="${escapeHtml(w.id)}"
        aria-label="Remover trabalhador ${escapeHtml(w.name)}"
      >✕</button>
    `;

    li.querySelector(".btn-worker-remove").addEventListener("click", () => onRemove(w.id));
    listEl.appendChild(li);
  });
}

/**
 * Initialise the workers UI: list, "add" button, and modal.
 * @param {Object} dom  The dom map from initDOM()
 */
export function initWorkersUI(dom) {
  // Initial render
  renderWorkers(dom.workersList, dom.workersEmpty, (id) => handleRemove(id, dom));

  // Start periodic health checks
  startWorkerHealthChecks(dom);

  // Open modal
  dom.addWorkerBtn.addEventListener("click", () => openWorkerModal(dom));

  // Tab switching
  dom.workerTabBtns.forEach(btn => {
    btn.addEventListener("click", () => switchTab(dom, btn.dataset.tab));
  });

  // Generate script
  dom.generateScriptBtn.addEventListener("click", () => handleGenerateScript(dom));

  // Copy script
  dom.copyScriptBtn.addEventListener("click", () => handleCopyScript(dom));

  // Download script (href set when generated)

  // Add worker button
  dom.workerModalAdd.addEventListener("click", () => handleAddWorker(dom));

  // Cancel / close modal
  dom.workerModalCancel.addEventListener("click", () => closeWorkerModal(dom));
  dom.workerModal.addEventListener("click", (e) => {
    if (e.target === dom.workerModal) closeWorkerModal(dom);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dom.workerModal.hidden) closeWorkerModal(dom);
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** @type {number|null} */
let _healthTimer = null;

function startWorkerHealthChecks(dom) {
  async function checkAll() {
    const workers = getWorkers();
    if (workers.length === 0) return;
    await Promise.allSettled(workers.map(w => checkWorkerHealth(w)));
    renderWorkers(dom.workersList, dom.workersEmpty, (id) => handleRemove(id, dom));
  }

  checkAll();
  _healthTimer = setInterval(checkAll, 30_000);
}

/** Clean up the health check interval (called on page unload). */
export function stopWorkerHealthChecks() {
  if (_healthTimer !== null) {
    clearInterval(_healthTimer);
    _healthTimer = null;
  }
}

function handleRemove(id, dom) {
  removeWorker(id);
  renderWorkers(dom.workersList, dom.workersEmpty, (rid) => handleRemove(rid, dom));
}

function openWorkerModal(dom) {
  // Reset modal state
  dom.workerScriptName.value = "";
  dom.workerScriptPort.value = "9000";
  dom.workerScriptUrl.value = "";
  dom.scriptOutput.hidden = true;
  dom.workerModalAdd.hidden = true;
  dom.workerManualName.value = "";
  dom.workerManualUrl.value = "";
  dom.workerModalError.textContent = "";
  switchTab(dom, "script");

  dom.workerModal.hidden = false;
  dom.workerScriptName.focus();
}

function closeWorkerModal(dom) {
  dom.workerModal.hidden = true;
}

function switchTab(dom, tab) {
  dom.workerTabBtns.forEach(btn => {
    btn.classList.toggle("modal-tab--active", btn.dataset.tab === tab);
  });
  dom.workerTabScript.hidden = (tab !== "script");
  dom.workerTabManual.hidden = (tab !== "manual");

  // Show/hide Add button based on active tab
  if (tab === "manual") {
    dom.workerModalAdd.hidden = false;
    dom.workerModalAdd.dataset.mode = "manual";
  } else {
    // For script tab: Add button is shown after script generation
    if (!dom.scriptOutput.hidden) {
      dom.workerModalAdd.hidden = false;
      dom.workerModalAdd.dataset.mode = "script";
    } else {
      dom.workerModalAdd.hidden = true;
    }
  }
}

/** Holds the last-generated worker stub (before URL is confirmed). */
let _pendingWorkerStub = null;

function handleGenerateScript(dom) {
  const name = dom.workerScriptName.value.trim();
  const port = dom.workerScriptPort.value.trim() || "9000";

  if (!name) {
    dom.workerModalError.textContent = "Por favor introduza um nome para o trabalhador.";
    dom.workerScriptName.focus();
    return;
  }

  dom.workerModalError.textContent = "";

  // Build a temporary stub (not saved yet — no URL)
  _pendingWorkerStub = {
    id: generateId(),
    name,
    token: generateToken(16),
  };

  const script = generateIntegrationScript(_pendingWorkerStub, port);
  dom.scriptCode.textContent = script;
  dom.scriptOutput.hidden = false;

  // Set download link
  const blob = new Blob([script], { type: "text/x-shellscript" });
  dom.downloadScriptBtn.href = URL.createObjectURL(blob);
  dom.downloadScriptBtn.download = `whisper-worker-${name.replace(/\s+/g, "-").toLowerCase()}.sh`;

  dom.workerModalAdd.hidden = false;
  dom.workerModalAdd.dataset.mode = "script";
}

async function handleCopyScript(dom) {
  const script = dom.scriptCode.textContent;
  if (!script) return;
  try {
    await navigator.clipboard.writeText(script);
    const orig = dom.copyScriptBtn.textContent;
    dom.copyScriptBtn.textContent = "✓ Copiado";
    setTimeout(() => { dom.copyScriptBtn.textContent = orig; }, 1800);
  } catch {
    dom.workerModalError.textContent = "Não foi possível copiar para a área de transferência.";
  }
}

function handleAddWorker(dom) {
  const mode = dom.workerModalAdd.dataset.mode;
  dom.workerModalError.textContent = "";

  if (mode === "manual") {
    const name = dom.workerManualName.value.trim();
    const url  = dom.workerManualUrl.value.trim();

    if (!name) {
      dom.workerModalError.textContent = "Por favor introduza um nome para o trabalhador.";
      dom.workerManualName.focus();
      return;
    }
    if (!url) {
      dom.workerModalError.textContent = "Por favor introduza o URL do trabalhador.";
      dom.workerManualUrl.focus();
      return;
    }
    if (!isValidUrl(url)) {
      dom.workerModalError.textContent = "URL inválido. Exemplo: http://192.168.1.100:9000";
      dom.workerManualUrl.focus();
      return;
    }

    addWorker(name, url);

  } else {
    // Script mode — URL entered after running the script
    const url = dom.workerScriptUrl.value.trim();

    if (!_pendingWorkerStub) {
      dom.workerModalError.textContent = "Por favor gere o script primeiro.";
      return;
    }
    if (!url) {
      dom.workerModalError.textContent = "Por favor introduza o URL obtido após executar o script.";
      dom.workerScriptUrl.focus();
      return;
    }
    if (!isValidUrl(url)) {
      dom.workerModalError.textContent = "URL inválido. Exemplo: http://192.168.1.100:9000";
      dom.workerScriptUrl.focus();
      return;
    }

    // Save the worker with the pre-generated token/id
    const workers = getWorkers();
    workers.push({
      id: _pendingWorkerStub.id,
      name: _pendingWorkerStub.name,
      url: url.replace(/\/+$/, ""),
      token: _pendingWorkerStub.token,
      createdAt: Date.now(),
      status: "unknown",
    });
    saveWorkers(workers);
    _pendingWorkerStub = null;
  }

  closeWorkerModal(dom);
  renderWorkers(dom.workersList, dom.workersEmpty, (id) => handleRemove(id, dom));

  // Immediately probe the new worker
  const allWorkers = getWorkers();
  const newest = allWorkers[allWorkers.length - 1];
  checkWorkerHealth(newest).then(() => {
    renderWorkers(dom.workersList, dom.workersEmpty, (id) => handleRemove(id, dom));
  });
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
