## 2024-11-12 - Debounce Server Search
**Learning:** In the qPilot frontend (`src/renderer/index.html`), state changes often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). To prevent main thread blocking and UI stuttering, high-frequency event listeners (like search inputs) must be debounced.
**Action:** Implemented a debounce wrapper function around `handleServerSearch` to ensure `renderServers()` is called only when necessary, preventing redundant layout thrashing and unnecessary CPU load.
