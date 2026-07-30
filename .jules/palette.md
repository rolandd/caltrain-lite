## 2026-06-12 - Prevent Invisible Backdrop Tab Focus

**Learning:** Native `<button>` elements used strictly as dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow when left with default behavior. This forces keyboard and screen reader users to navigate through hidden elements to reach the content behind them.
**Action:** Always add `tabindex="-1"` to visually hidden backdrop buttons to maintain a logical and streamlined keyboard focus order.
