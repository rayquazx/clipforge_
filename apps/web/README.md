# ClipForge Web Client

A modern Next.js 14 App Router application for automated gaming and stream highlight detection, editing, ad injection, and batch rendering.

---

## Architecture & Technology Stack

- **Framework**: Next.js 14 (App Router, React 18, TypeScript)
- **Styling**: Tailwind CSS with dark theme palette (`#0d0d12` background, `#9146FF` twitch purple primary)
- **State Management**: Zustand stores (`editor-store.ts`, `auth-store.ts`)
- **Server Cache & Sync**: TanStack Query v5 with automatic SSE invalidation and 3s polling fallback
- **Network & Mocking**: Axios API client + MSW (Mock Service Worker) for 100% offline development
- **Testing**: Vitest with React Testing Library + Playwright E2E

---

## Directory Structure

```
apps/web/
├── e2e/                             # Playwright end-to-end tests
│   ├── editor.spec.ts               # Auth & clip trimming/export tests
│   └── phase6-ads-batches.spec.ts   # Phase 6 Ad library, templates, timeline, batches
├── public/                          # Public static assets & mock media
│   ├── mock/                        # 206 video samples, waveforms, thumbnails
│   └── mockServiceWorker.js         # MSW browser worker script
├── src/
│   ├── app/                         # App Router pages & layouts
│   │   ├── (auth)/                  # Login & registration flows
│   │   ├── ads/                     # Ad Library & Templates tabs (/ads, /ads/templates)
│   │   ├── batches/                 # Batch exports list & detail pages (/batches, /batches/[id])
│   │   ├── clips/                   # Clip library (/clips) & Editor (/clips/[id])
│   │   ├── dashboard/               # Stream projects & import page
│   │   ├── exports/                 # Redirects to /batches
│   │   └── layout.tsx               # Root layout with Query, MSW, Toast providers
│   ├── components/
│   │   ├── ads/                     # AdAssetCard, AdUploadModal, TextAdCreatorDialog, AdDeleteDialog, AdTemplateModal
│   │   ├── batches/                 # BatchExportDialog
│   │   ├── editor/                  # EditorPlayer, EditorTimeline, EditorAdsPanel, EditorPreviewWithAdsModal
│   │   ├── providers/               # MswProvider, QueryProvider
│   │   └── ui/                      # Button, Dialog, Input, Skeleton, Toast
│   ├── hooks/
│   │   └── useEventStream.ts        # SSE hook with reconnect, event bus, polling fallback
│   ├── lib/
│   │   ├── ad-math.ts               # Pure placement & timeline math module
│   │   ├── api.ts                   # Typed API client with central error handling
│   │   ├── auth.ts                  # Access/refresh token storage
│   │   └── time-mapping.ts          # Source time <-> preview time conversions
│   ├── mocks/                       # MSW mock handlers & data for all contract endpoints
│   └── stores/                      # Zustand editor and auth stores
```

---

## Phase 6 Time Rules & Mathematical Model (`src/lib/ad-math.ts`)

1. **Main Clip Time**:
   - Overlays and lower thirds are positioned in **MAIN clip time** (`0 = start of trimmed clip`).
   - Timestamps never shift when changing pre-roll or post-roll duration.
   - When the final video is encoded, the backend renderer shifts overlays by `preroll_duration_sec`.

2. **Total Video Duration**:
   $$\text{Total Duration} = \text{Preroll Duration} + \text{Main Clip Duration} + \text{Postroll Duration}$$
   - The UI surfaces this breakdown via `calculateTimeline`:
     `"Total 0:47 = 0:05 ad + 0:40 clip + 0:02 ad"`.

3. **Ad Layout Coordinates**:
   - Handled via `layoutToCSS`: supports presets (`top_left`, `top_right`, `bottom_left`, `bottom_right`, `center`, `custom`).
   - `scale`: fraction of video width (0–1).
   - `margin`: fractional offset from edges (0–1).

---

## Running the Application

### 1. Mock Mode (Default & Standalone)

In mock mode, the frontend operates completely offline with mock projects, clips, waveforms, and video player without requiring Docker, PostgreSQL, Redis, or Python.

1. Ensure `.env.local` contains:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_USE_MOCKS=true
   ```
2. Start the development server from the repository root:
   ```bash
   pnpm --filter @clipforge/web dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Real Backend Mode

To connect to the real Docker services:

1. In the repository root (`C:\Users\xhesp\clipforge_`), start the backend containers:
   ```bash
   docker compose up -d postgres redis minio api worker
   ```
2. In `.env.local`, set:
   ```env
   NEXT_PUBLIC_USE_MOCKS=false
   ```
3. Start the Next.js dev server:
   ```bash
   pnpm --filter @clipforge/web dev
   ```

---

## Running Tests

### Unit & Component Tests (Vitest)
```bash
pnpm --filter @clipforge/web test
```

### End-to-End Tests (Playwright)
```bash
pnpm --filter @clipforge/web test:e2e
```
