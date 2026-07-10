## 2024-05-30 - Prevent dismiss backdrops from intercepting focus

**Learning:** Native `<button>` elements used strictly as dismiss backdrops (without visual presence) can unnecessarily intercept keyboard tab flow, frustrating users who navigate via keyboard.
**Action:** Apply `tabindex="-1"` to such elements to remove them from the default focus order.
