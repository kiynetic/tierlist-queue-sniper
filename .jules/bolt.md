## 2024-10-23 - Debouncing Server Search Inputs
**Learning:** In the qPilot frontend (`src/renderer/index.html`), state changes often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). This causes main thread blocking and UI stuttering during high-frequency events like typing in a search bar.
**Action:** Debounce high-frequency event listeners (like `oninput` for search) to prevent synchronous DOM repaints from blocking the main thread during user input.
