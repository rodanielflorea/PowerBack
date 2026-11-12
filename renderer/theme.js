// The app theme: "dark" (default), "light" or "system" (follows the OS).
// Loaded in <head>, before the page paints, so there is no flash of the other
// theme. Sets <html data-theme="dark|light">; the stylesheets read it.
// The choice is kept in localStorage, which every Ace page shares, so other
// open windows follow a change at once (the "storage" event).
(function () {
  const KEY = "ace.theme";
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function pref() {
    let v = null;
    try { v = localStorage.getItem(KEY); } catch {}
    return v === "light" || v === "system" || v === "dark" ? v : "dark";
  }
  function apply() {
    const p = pref();
    const theme = p === "system" ? (media && !media.matches ? "light" : "dark") : p;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.dispatchEvent(new CustomEvent("ace-theme", { detail: { pref: p, theme } }));
  }
  window.aceTheme = {
    get: pref,
    set(p) {
      try { localStorage.setItem(KEY, p); } catch {}
      apply();
    },
  };
  if (media && media.addEventListener) media.addEventListener("change", () => { if (pref() === "system") apply(); });
  window.addEventListener("storage", (e) => { if (e.key === KEY) apply(); });
  apply();
})();
