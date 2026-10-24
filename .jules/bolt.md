
## 2024-05-24 - Debouncing DOM-heavy Search
**Learning:** In the qPilot frontend (vanilla JS, no virtual DOM), state changes like search filtering trigger full synchronous DOM reconstructions via `renderServers()`. High-frequency events on elements like `#serverSearchInput` can block the main thread and cause UI stuttering if not debounced.
**Action:** Always debounce high-frequency event handlers (like input typing) when they trigger full DOM re-rendering in vanilla JS applications to prevent main thread blocking.
