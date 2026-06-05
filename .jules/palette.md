## 2024-05-18 - Invisible Backdrop Keyboard Focus

**Learning:** Native `<button>` elements used strictly as dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow, frustrating users who rely on keyboard navigation.
**Action:** Always add `tabindex="-1"` to full-screen backdrop buttons that only exist to capture click-away events, keeping keyboard navigation focused on actual content.
