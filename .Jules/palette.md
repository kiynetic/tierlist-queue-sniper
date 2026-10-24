## 2024-05-18 - Missing ARIA Labels on Icon Buttons
**Learning:** The qPilot Electron app relies heavily on custom HTML icon buttons (e.g., window controls, modal close buttons) built with Phosphor Icons. Many of these elements lack text content or `aria-label` attributes, making them inaccessible to screen readers.
**Action:** Always verify that icon-only interactive elements in vanilla JS/HTML views include an explicit `aria-label`.
