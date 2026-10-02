// Light/dark theme preference. "system" follows the OS; "light"/"dark" pin
// it. The choice is per device (a phone and a laptop can differ), so it
// lives in its own localStorage key outside the synced app data.
//
// The resolved theme is a `data-theme` attribute on <html> that globals.css
// keys its dark palette off. THEME_INIT_SCRIPT runs inline in <head>, before
// first paint, so a pinned theme never flashes the other one; it also keeps
// "system" live as the OS setting changes.

export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "commish:theme";
const CHANGE_EVENT = "commish:theme-change";

export function getThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  applyTheme(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** useSyncExternalStore subscriber: fires on a change from this tab or another one. */
export function subscribeThemePreference(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Inline <head> script — the same logic as applyTheme, plus listeners for OS changes and other tabs. */
export const THEME_INIT_SCRIPT = `(function(){
var m=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){var p;try{p=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}
document.documentElement.dataset.theme=p==="dark"||(p!=="light"&&m.matches)?"dark":"light"}
apply();m.addEventListener("change",apply);
addEventListener("storage",function(e){if(e.key===${JSON.stringify(THEME_KEY)})apply()});
})();`;
