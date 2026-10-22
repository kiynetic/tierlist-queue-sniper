## 2024-03-22 - Synchronous Vanilla JS DOM Reconstruction anti-pattern
**Learning:** In `src/renderer/index.html`, the app uses vanilla JavaScript and fully reconstructs the DOM via `renderServers()` on state changes (like searching). Without a virtual DOM framework to diff changes, this full reconstruction on every keystroke in search can block the main thread and cause UI stutter on machines parsing large server lists.
**Action:** Debounce inputs that trigger `renderServers()` or similar full-DOM-rebuilding functions to prevent unnecessary layout thrashing and main thread blocking.
