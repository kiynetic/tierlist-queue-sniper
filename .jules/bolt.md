## 2023-10-20 - Vanilla JS DOM Re-render Bottleneck
**Learning:** Because the frontend uses vanilla JS (without a virtual DOM), functions like `renderServers` that destroy and recreate the entire list of servers in the DOM are unusually expensive. This makes rapid event triggers like `oninput` for search highly problematic.
**Action:** Always verify if expensive full-DOM updates are triggered by user input events and implement debouncing or throttling when necessary, particularly in vanilla JS implementations.
