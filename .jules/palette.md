## 2024-03-13 - [Focus Rings on Buttons]
**Learning:** Found that multiple interactive elements (`<button>` and `<a>`) were missing explicit focus indicators, which is an accessibility issue for keyboard users relying on tab navigation. Tailwind utility classes (`focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-none`) needed to be added consistently.
**Action:** When adding or reviewing interactive elements in the `apps/pwa` package, ensure `focus-visible` utility classes are always included to provide clear visual feedback during keyboard navigation.
