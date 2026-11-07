## 2024-05-15 - Debouncing Synchronous DOM Updates in Vanilla JS
**Learning:** In the qPilot frontend (`src/renderer/index.html`), state changes (like searching servers) trigger full, synchronous DOM reconstructions via `renderServers()`.  Without a virtual DOM, frequent events like key presses cause immediate main thread blocking, leading to severe UI stuttering and input lag.
**Action:** Always debounce high-frequency event listeners (e.g., search inputs, sliders) that trigger expensive synchronous DOM manipulations (`innerHTML` updates) in this vanilla JS architecture.
