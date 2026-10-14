## 2025-02-20 - Fast Filtering of High-Frequency WebSocket Data
**Learning:** In heavily loaded WebSocket environments (like Discord gateways receiving large payload state updates), multiple consecutive `String.prototype.includes()` checks on the raw string before parsing block the main thread significantly.
**Action:** Always pre-filter massive JSON payloads utilizing a single, compiled Regular Expression for key event signatures before attempting `JSON.parse()`, as compiled regex execution on raw strings is an order of magnitude faster.
