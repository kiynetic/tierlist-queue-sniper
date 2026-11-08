## 2026-11-08 - Debounce synchronous DOM reconstructions
**Learning:** State changes in the frontend often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). This can block the main thread and cause UI stuttering if high-frequency events like search inputs aren't debounced.
**Action:** Debounce high-frequency event listeners that trigger expensive DOM updates to preserve smooth UI performance.
