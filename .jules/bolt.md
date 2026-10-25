## 2024-05-24 - Debouncing Frontend High-Frequency Events
**Learning:** State changes in the frontend application (`src/renderer/index.html`) trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). This blocks the main thread, causing severe UI stuttering during high-frequency events like input in the server search bar.
**Action:** Always debounce event listeners attached to search inputs or other high-frequency DOM inputs to prevent performance degradation from synchronous main thread blocking.
