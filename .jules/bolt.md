## 2024-10-24 - Debouncing Synchronous DOM Reconstruction
**Learning:** In the qPilot frontend (`src/renderer/index.html`), state changes often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`), which can cause severe main thread blocking and UI stuttering during high-frequency events like search input.
**Action:** Apply debouncing (e.g., via `setTimeout`) to high-frequency event listeners that trigger full DOM reconstructions to ensure the UI remains responsive during user input.
