## 2024-05-24 - Interactive Overlays & Backdrop Accessibility

**Learning:** Invisible background backdrop buttons used to dismiss overlays can accidentally intercept keyboard tab navigation, confusing screen reader and keyboard-only users. Additionally, custom interactive elements (`role="button"`) often lack explicit focus indicators compared to native inputs.
**Action:** Always apply `tabindex="-1"` to non-visual backdrop buttons and ensure custom interactive elements have explicit focus styles (`focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent`) and appropriate ARIA states (like `aria-expanded` or `aria-haspopup`).
