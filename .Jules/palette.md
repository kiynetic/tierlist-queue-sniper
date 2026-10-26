## 2024-05-18 - [Accessibility] Explicit ARIA labels on Icon-only controls
**Learning:** Custom window controls (like minimize, maximize, close) and modal close buttons in Electron apps lose native semantic meaning and need explicit `aria-label` attributes to be accessible to screen reader users.
**Action:** Always verify icon-only buttons include `aria-label` during frontend development to maintain a11y standards.
