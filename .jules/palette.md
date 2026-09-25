## 2024-10-24 - Handle Space key for custom buttons

**Learning:** Custom elements with `role="button"` require explicit handling for both Enter and Space keys to function like native buttons, as Space natively scrolls the page.
**Action:** Always handle both 'Enter' and ' ' (Space) in `onkeydown` listeners for custom buttons, and call `e.preventDefault()` for Space to prevent page jumping.
