## 2026-10-09 - App-Wide Missing ARIA Labels
**Learning:** Found that this Electron app's UI uses many icon-only buttons (like modal close buttons) without any ARIA labels, making them completely inaccessible to screen readers.
**Action:** Consistently check for and add aria-label attributes to all icon-only buttons, especially in reusable components like modals.
