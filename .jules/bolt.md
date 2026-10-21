## 2024-05-14 - Initial Setup
**Learning:** Initializing journal to log critical performance insights for qPilot.
**Action:** Always check here before applying performance optimizations.

## 2024-10-21 - Debouncing Frontend Search
**Learning:** In vanilla JS setups like `qPilot`, tying DOM updates directly to `oninput` events can cause significant performance degradation (UI thread blocking) when filtering large lists (like hundreds of waitlists).
**Action:** Always add a debounce timeout (e.g., 300ms) to frequent event listeners that trigger expensive DOM manipulations like `renderServers()`.
