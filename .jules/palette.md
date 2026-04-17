## 2024-05-24 - Tooltip Backdrop Keyboard Interception

**Learning:** Native `<button>` elements used strictly as invisible dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow, which breaks logical keyboard navigation.
**Action:** Apply `tabindex="-1"` to any `<button>` used as an invisible background dismiss layer to prevent it from entering the focus order.
