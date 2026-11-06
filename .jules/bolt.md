## 2026-11-06 - Synchronous DOM Reconstructions
**Learning:** In vanilla JS architectures with synchronous full-DOM reconstructions (like `renderServers()`), high-frequency events like search inputs can severely block the main thread and cause UI stuttering.
**Action:** Always debounce search inputs and other high-frequency event listeners when they trigger heavy DOM updates.