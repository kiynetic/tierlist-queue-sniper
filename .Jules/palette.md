## 2024-10-08 - Accessible Window and Close Controls
**Learning:** Found multiple icon-only buttons (.win-btn, .modal-close-btn, .remove-account-btn) missing proper aria-labels and keyboard focus indicators. This pattern exists across multiple UI areas including the titlebar, modals, and list items.
**Action:** When adding or modifying interactive icons in this application, ensure semantic aria-labels are explicitly set (rather than relying just on title attributes) and include a visible :focus-visible state to support keyboard users.
