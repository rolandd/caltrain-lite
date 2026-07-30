## 2024-05-24 - Tooltip backdrop button intercepts keyboard tab flow

**Learning:** Native `<button>` elements used strictly as dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow when the tooltip is active.
**Action:** Always apply `tabindex="-1"` to full-screen invisible dismiss backdrops.
