## 2024-10-17 - Missing ARIA Labels on Icon-only Buttons
**Learning:** The application heavily relies on icon-only buttons (like minimize, maximize, close, switch accounts, remove accounts, eye toggle for passwords) but these buttons lack `aria-label` attributes, making them inaccessible to screen readers.
**Action:** Adding `aria-label` to these critical icon-only buttons is a crucial micro-UX improvement to ensure accessibility.
