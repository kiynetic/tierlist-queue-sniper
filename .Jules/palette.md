## 2024-05-24 - Missing ARIA Labels on Icon-only Buttons in Vanilla JS App
**Learning:** Custom modals and icon-only buttons built with vanilla HTML/JS often lack the implicit accessibility features (like `aria-label`) that framework components (like those in React/Vue component libraries) usually enforce or provide by default.
**Action:** Always verify the presence of `aria-label` on icon-only buttons (`<button><i class="icon"></i></button>`) and window controls when auditing non-framework UI code.
