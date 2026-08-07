## 2025-01-20 - Remove invisible backdrops from tab sequence

**Learning:** Native `<button>` elements used strictly as full-screen invisible dismiss backdrops receive keyboard focus by default, confusing keyboard users since they have no visual presence.
**Action:** Always apply `tabindex="-1"` to invisible backdrop buttons to prevent them from intercepting keyboard tab flow.
