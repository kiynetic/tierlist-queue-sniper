## 2024-05-24 - Debouncing DOM Reconstructions in qPilot
**Learning:** State changes in qPilot often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). Without a virtual DOM framework like React or Vue, calling these render functions on high-frequency events like typing blocks the main thread and causes severe UI stuttering.
**Action:** When implementing real-time inputs or handlers for high-frequency events in this codebase, always debounce the state update or render function call to prevent blocking the main thread.
