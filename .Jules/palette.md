## 2024-05-14 - Modal close buttons missing accessible name
**Learning:** Found multiple icon-only "close" buttons (`<button class="modal-close-btn">`) in the modal system that lacked an `aria-label` or any visually hidden text.
**Action:** Added `aria-label="Close modal"` to these elements to ensure screen reader users can identify their function.
