## 2024-05-18 - Missing ARIA Labels on Icon Buttons and Inputs
**Learning:** This application heavily uses custom icon-only buttons (e.g., window controls, modal close buttons) and stylized text inputs without associated visual `<label>` elements, which causes accessibility issues for screen readers.
**Action:** Always verify `aria-label` is present on icon-only interactive elements and form fields that lack a visible associated `<label>` in this design system.
