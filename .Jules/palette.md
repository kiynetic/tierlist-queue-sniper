## 2024-05-18 - Missing ARIA labels on Titlebar Window Controls
**Learning:** Icon-only buttons used for OS-level window controls (Minimize, Maximize, Close) in custom Electron titlebars frequently rely only on `title` attributes, making them partially or fully inaccessible to screen readers which often expect explicit `aria-label` attributes for critical navigation and window state elements.
**Action:** When inspecting or adding custom titlebars/window controls, always ensure `aria-label` is explicitly defined alongside or instead of `title` attributes for icon-only buttons.
