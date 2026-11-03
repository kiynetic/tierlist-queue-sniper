## 2024-11-03 - Debouncing High-Frequency Events for Synchronous DOM Reconstruction
**Learning:** In the qPilot frontend (`src/renderer/index.html`), state changes often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). This can block the main thread and cause UI stuttering on high-frequency events.
**Action:** Always debounce event listeners (like search inputs) that trigger full DOM rebuilds to maintain a responsive UI.
