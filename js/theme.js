// js/theme.js

const STORAGE_KEY = "whisper-theme";
const TOGGLE_ID = "theme-toggle";

const ICONS = {
  dark: "🌙",
  light: "☀️",
};

/**
 * Initialise theme from localStorage or system preference.
 */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
}

/**
 * Apply a theme by setting data-theme attribute and updating the toggle button.
 * @param {"dark"|"light"} theme
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);

  const btn = document.getElementById(TOGGLE_ID);
  if (btn) {
    btn.textContent = theme === "dark" ? ICONS.light : ICONS.dark;
    btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
    btn.setAttribute("title", theme === "dark" ? "Tema claro" : "Tema escuro");
  }
}

/**
 * Toggle between dark and light themes.
 */
export function toggleTheme() {
  const current = document.documentElement.dataset.theme ?? "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}
