## 2026-07-03 - Prevent Backdrop Button Focus Interception

**Learning:** Native `<button>` elements used strictly as dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow, creating confusing ghost tab stops for keyboard users.
**Action:** Apply `tabindex="-1"` to all invisible backdrop buttons to prevent them from intercepting keyboard tab flow while maintaining click functionality.
