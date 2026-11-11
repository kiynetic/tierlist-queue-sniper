## 2024-03-21 - Debouncing State Updates in qPilot
**Learning:** In the qPilot frontend (`src/renderer/index.html`), state changes often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). High-frequency event listeners like search inputs can block the main thread and cause UI stuttering if not optimized.
**Action:** Always debounce high-frequency inputs (like text searches) by at least 250ms before calling heavy render functions to prevent unnecessary DOM recalculations and frame drops.
