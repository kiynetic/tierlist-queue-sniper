## 2024-03-21 - Added ARIA labels to icon-only close buttons
**Learning:** Found multiple icon-only close buttons (like `.modal-close-btn` and `.win-btn`) lacking `aria-label` attributes, which prevents screen readers from understanding their function.
**Action:** Always verify that interactive elements relying solely on visual icons have appropriate textual fallbacks for accessibility (e.g., `aria-label`).
