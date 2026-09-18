## 2024-09-18 - Keyboard Accessibility for Custom Buttons

**Learning:** When using `role="button"` on non-button elements, the browser doesn't automatically trigger the action on `Space` or `Enter` keys. Furthermore, pressing `Space` causes the page to scroll by default, which disrupts keyboard navigation.
**Action:** Always handle both `Enter` and `Space` keys in the `onkeydown` event for custom `role="button"` elements, and explicitly call `e.preventDefault()` when `Space` is pressed to avoid unintended page scrolling.
