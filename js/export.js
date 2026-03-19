// js/export.js

/**
 * Trigger a file download in the browser.
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export results as plain text (.txt).
 * @param {Array<{ name: string, text: string }>} results
 */
export function exportAsText(results) {
  const content = results
    .map(r => `=== ${r.name} ===\n\n${r.text}`)
    .join("\n\n---\n\n");
  downloadFile(content, "transcricoes.txt", "text/plain;charset=utf-8");
}

/**
 * Export results as SubRip subtitle format (.srt).
 * Note: Whisper ASR in basic mode returns plain text without segment timestamps.
 * Each line is assigned sequential placeholder timecodes spaced 3 seconds apart.
 * For accurate timestamps, use a Whisper build that returns per-segment timing.
 * @param {Array<{ name: string, text: string }>} results
 */
export function exportAsSRT(results) {
  let srt = "";
  let idx = 1;
  let timeOffset = 0; // seconds

  function toSrtTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},000`;
  }

  results.forEach(r => {
    // File header block
    srt += `${idx}\n`;
    srt += `${toSrtTime(timeOffset)} --> ${toSrtTime(timeOffset + 1)}\n`;
    srt += `[${r.name}]\n\n`;
    idx++;
    timeOffset += 1;

    // One block per non-empty line, each 3 seconds
    const lines = r.text.split(/\n+/).filter(Boolean);
    lines.forEach(line => {
      srt += `${idx}\n`;
      srt += `${toSrtTime(timeOffset)} --> ${toSrtTime(timeOffset + 3)}\n`;
      srt += `${line}\n\n`;
      idx++;
      timeOffset += 3;
    });
  });
  downloadFile(srt, "transcricoes.srt", "text/plain;charset=utf-8");
}

/**
 * Export results as JSON (.json).
 * @param {Array<{ name: string, text: string }>} results
 */
export function exportAsJSON(results) {
  const payload = {
    exportedAt: new Date().toISOString(),
    count: results.length,
    results: results.map(r => ({
      filename: r.name,
      transcription: r.text,
    })),
  };
  downloadFile(
    JSON.stringify(payload, null, 2),
    "transcricoes.json",
    "application/json"
  );
}
