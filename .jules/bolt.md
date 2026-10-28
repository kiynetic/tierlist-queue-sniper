## 2024-10-28 - Debouncing Main Thread Blocking Re-renders
**Learning:** In the qPilot frontend (built without a virtual DOM), state changes like searching often trigger full, synchronous DOM reconstructions (e.g., via `renderServers()`). This blocks the main thread and causes severe UI stuttering on high-frequency events like input keystrokes.
**Action:** Always wrap high-frequency event listeners (like search inputs) in a debounce or throttle to batch and delay heavy synchronous DOM updates until the event frequency drops.
