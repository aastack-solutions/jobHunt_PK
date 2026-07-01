# frontend/CLAUDE.md

Rules for everything inside `frontend/`. Read before touching any file here.

## Pinned Package Versions

```json
"react": "19.2.7",           "react-dom": "19.2.7",
"react-router": "7.18.0",    "vite": "8.0.16",
"tailwindcss": "4.3.1",      "@tailwindcss/vite": "4.3.1",
"@tanstack/react-query": "5.101.0",
"axios": "1.18.1",           "react-hook-form": "7.80.0",
"@hookform/resolvers": "5.1.1", "zod": "4.4.3",
"chart.js": "4.5.1",         "react-chartjs-2": "5.3.1",
"lucide-react": "1.21.0",    "date-fns": "4.4.0",
"react-hot-toast": "2.6.0"
```

## Page and Component Files

```
src/pages/Login.jsx
src/pages/Dashboard.jsx      ← Remote / Karachi / Combined tabs
src/pages/Jobs.jsx           ← locationType filter, distance sort
src/pages/Applications.jsx   ← pipeline, CSV export
src/pages/Interviews.jsx     ← CRUD, outcome tracking
src/pages/Resume.jsx         ← upload, skill editor
src/pages/Settings.jsx       ← Remote/Karachi toggles, salary+currency, homeArea

src/components/Navbar.jsx
src/components/MatchBadge.jsx       ← Excellent/Good/Fair/Low
src/components/LocationTypePill.jsx ← Remote/Onsite/Hybrid
src/components/StatusPill.jsx       ← application status
src/components/CoverLetterModal.jsx ← Groq generation + polling
src/components/SchedulerAlert.jsx   ← red alert if fetch >25h or source 0 for 3 days

src/hooks/useAITask.js   ← AI polling with 2-min timeout
src/hooks/useAuth.js     ← session state
```

## React Router 7 — Import Correctly

```javascript
// CORRECT — package is 'react-router' not 'react-router-dom'
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from 'react-router';
```

All hook APIs are identical to React Router v6. Only the import path changed.

## Tailwind CSS 4 — No tailwind.config.js

```css
/* src/index.css — only config needed */
@import "tailwindcss";

@theme {
  /* custom tokens here if needed */
}
```

No `tailwind.config.js`. No `postcss.config.js`. The `@tailwindcss/vite` plugin handles everything.

## Vite Config — outDir Must Not Change

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: '../backend/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:5000', '/health': 'http://localhost:5000' } },
});
```

`outDir: '../backend/public'` must never change — it's how the backend serves the frontend.

## Data Fetching

- Use `@tanstack/react-query` (`useQuery`, `useMutation`) for all data that needs caching, loading states, or refetching
- Use plain `axios` only for fire-and-forget mutations
- Never use `fetch()` directly
- Never store server data in `useState` when React Query can manage it

## Forms

- Use `react-hook-form` with `@hookform/resolvers/zod` for all forms
- Define a Zod schema for every form
- Never use uncontrolled inputs without validation

## AI Polling — useAITask Hook

The `useAITask` hook in `hooks/useAITask.js` is the only place polling logic lives.
Never inline polling directly in a component.

```javascript
// Required: stop after 60 polls (2 minutes)
let polls = 0;
const interval = setInterval(async () => {
  if (++polls > 60) {
    clearInterval(interval);
    setError('Request timed out. Please try again.');
    return;
  }
  const { data } = await axios.get(`/api/ai/status/${jobId}`);
  if (data.status === 'completed') { clearInterval(interval); setResult(data.result); }
  if (data.status === 'failed')    { clearInterval(interval); setError('Generation failed.'); }
}, 2000);
```

## Dashboard Views

The dashboard has three tabs: **Remote**, **Karachi-Onsite**, **Combined**.
Each tab filters by `locationType` using the denormalized field — never join to jobs table for this.

The `SchedulerAlert` component must show:
- Red banner if `daily-job-fetch` has not run in >25 hours
- Source failure alert if any source shows 0 jobs for 3+ consecutive days (from `sourceBreakdown` in SchedulerLog)

## Settings Page Rules

`Settings.jsx` must contain all preference controls:
- Remote jobs toggle (`wantsRemote`)
- Karachi-Onsite toggle (`wantsOnsiteKarachi`)
- `homeArea` text input — label: "Used for distance sorting via OpenStreetMap — optional and approximate"
- Salary min/max inputs with currency selector (PKR / USD)
- Timezone selector

On save: call `PATCH /api/users/me/preferences`. This triggers a delta re-match server-side.

## Error Handling

Add React error boundaries to all page-level components.
No page should ever show a blank white screen on an unhandled error.

## What Not to Do

- Never import from `react-router-dom`
- Never create `tailwind.config.js`
- Never put global styles outside `index.css`
- Never use `localStorage` or `sessionStorage` for auth state — use `useAuth` hook
- Never add a payment UI, public signup page, or admin dashboard