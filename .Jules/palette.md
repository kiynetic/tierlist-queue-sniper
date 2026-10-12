## 2024-05-24 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Found multiple instances of icon-only buttons (like window controls, modal close buttons, copy snippets, and visibility toggles) lacking ARIA labels, making them inaccessible to screen readers which rely on text equivalents. Using just visual icons or `title` attributes is insufficient.
**Action:** Ensure that all buttons, especially those using icon fonts or SVGs without visible text, have a descriptive `aria-label` attribute added to improve accessibility and screen reader support.
