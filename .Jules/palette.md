## 2024-10-20 - Missing ARIA Labels on Icon Buttons
**Learning:** The application uses several icon-only buttons (`.win-btn`, `.modal-close-btn`, `.remove-account-btn`, etc.) that lack `aria-label` attributes. While some have `title` attributes, relying solely on `title` is insufficient for accessibility, as screen readers may not consistently read them depending on user settings, and they are not available to keyboard-only users without hover.
**Action:** Always add `aria-label` to icon-only buttons to ensure they are properly identified by assistive technologies.
