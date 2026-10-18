## 2024-05-23 - Accessibility for Icon-only Buttons
**Learning:** Found multiple icon-only buttons in the UI (window controls, modal close buttons, clear logs button, etc) that lacked screen reader context (no aria-labels).
**Action:** Always verify that buttons containing only icons (like Phosphor icons) have an appropriate `aria-label` providing context for screen reader users.
