## 2024-03-24 - [Debounce High-Frequency Input Events]
**Learning:** State changes in the qPilot frontend (via vanilla JS) often trigger full, synchronous DOM reconstructions (like `renderServers()`), causing main thread blocking and UI stuttering on high-frequency events.
**Action:** Always debounce event listeners for text inputs (e.g., search) when the handler triggers expensive DOM updates.