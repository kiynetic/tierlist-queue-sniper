## 2024-05-24 - Debouncing high-frequency events in Vanilla JS DOM
**Learning:** In the qPilot frontend (vanilla JS), state changes often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). This causes main thread blocking and severe UI stuttering on high-frequency events like text input.
**Action:** Always debounce high-frequency event listeners (like search inputs) when they trigger full DOM rebuilds to prevent main thread blocking.
