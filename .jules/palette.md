## 2024-06-19 - Invisible Backdrop Button Tab Order

**Learning:** Native <button> elements used strictly as dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow.
**Action:** Always apply `tabindex="-1"` to such invisible backdrop buttons to prevent them from interfering with keyboard navigation.
