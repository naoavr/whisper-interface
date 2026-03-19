// js/queue.js
import { escapeHtml, formatBytes } from "./dom.js";

export const BADGE_LABELS = {
  waiting: "A aguardar",
  active:  "A processar",
  done:    "Concluído",
  error:   "Erro",
};

/**
 * Build queue items inside the given container.
 *
 * @param {FileList|File[]} files
 * @param {HTMLElement} container
 */
export function buildQueue(files, container) {
  container.innerHTML = "";
  Array.from(files).forEach((file, i) => {
    const li = document.createElement("li");
    li.className = "queue-item";
    li.dataset.index = i;
    li.setAttribute("role", "listitem");

    li.innerHTML = `
      <span class="item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="item-size">${formatBytes(file.size)}</span>
      <span class="badge badge-waiting" id="badge-${i}" aria-label="Estado: ${BADGE_LABELS.waiting}">${BADGE_LABELS.waiting}</span>
    `;

    container.appendChild(li);
  });
}

/**
 * Update the badge for a specific queue item.
 *
 * @param {number} index
 * @param {"waiting"|"active"|"done"|"error"} state
 */
export function setBadge(index, state) {
  const badge = document.getElementById(`badge-${index}`);
  if (!badge) return;

  badge.className = `badge badge-${state}`;
  badge.textContent = BADGE_LABELS[state] ?? state;
  badge.setAttribute("aria-label", `Estado: ${BADGE_LABELS[state] ?? state}`);
}
