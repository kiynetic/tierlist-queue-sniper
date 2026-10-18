## 2024-05-24 - Debouncing DOM-heavy functions
**Learning:** In vanilla JS/Electron apps where `renderServers()` reconstructs the DOM from scratch via `innerHTML` on a large list, triggering this on every keystroke (`oninput`) causes significant main-thread blocking and UI stutter.
**Action:** Always wrap `oninput` handlers that trigger full-list DOM rebuilds in a debounce function (e.g. 200ms) to batch updates and maintain smooth typing performance.
