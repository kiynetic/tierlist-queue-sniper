## 2024-05-18 - Missing Accessible Names on Electron Custom Window Controls
**Learning:** Custom window controls and modal close buttons in Electron apps frequently lack accessible names because they rely solely on icon elements (like `<i class="ph ph-x"></i>`), which are opaque to screen readers.
**Action:** Always ensure explicit `aria-label` attributes are present on icon-only buttons.
