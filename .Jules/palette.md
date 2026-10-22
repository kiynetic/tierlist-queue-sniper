## 2026-10-22 - [Missing ARIA labels on Icon-only Window Controls]
**Learning:** In Electron applications, custom window controls (Minimize, Maximize, Close) and modal close buttons are frequently implemented as custom icon-only HTML elements rather than native OS elements. Because of this, developers often forget to include accessible names.
**Action:** Always verify that custom icon-only controls in Electron DOMs have explicit `aria-label` attributes to maintain screen reader accessibility.
