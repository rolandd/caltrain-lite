## 2024-05-18 - Missing title attribute for icon-only buttons

**Learning:** Icon-only buttons often include an `aria-label` for screen readers, but mouse users lack tooltips explaining the icon's action if a `title` attribute isn't present, decreasing usability.
**Action:** Always include a `title` attribute matching the `aria-label` on icon-only buttons to ensure a tooltip is displayed for mouse users, accommodating both pointer devices and screen readers effectively.
