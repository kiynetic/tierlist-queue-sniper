## 2024-10-06 - Missing ARIA labels on Icon-only Close Buttons
**Learning:** Found that custom modal and drawer close buttons in this app's UI lacked explicit accessible names since they only contained `<i class="ph ph-x"></i>`. This is a common accessibility trap in custom Electron UIs that use icon libraries like Phosphor Icons without companion screen reader text.
**Action:** When working on custom UI components, always ensure icon-only buttons (`.modal-close-btn`, `.drawer-close-btn`, etc.) have explicit `aria-label` attributes to provide an accessible name for screen readers.
