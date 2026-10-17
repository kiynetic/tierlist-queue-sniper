## 2024-10-27 - Debouncing DOM-heavy Search Inputs in Electron
**Learning:** In Electron applications, filtering large DOM lists on the `oninput` event without debouncing can lead to severe main thread blocking and UI stuttering, especially when the search triggers heavy operations like re-rendering many complex UI elements.
**Action:** Always wrap `oninput` or `onchange` search handlers that trigger large DOM updates in a debounce function (e.g., using `setTimeout`) to batch updates and keep the application responsive.
