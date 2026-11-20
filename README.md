# Meetle Recorder (Chrome extension)

Records the Google Meet tab from inside the teacher's own browser (video + student's voice + teacher's mic, mixed) and uploads it to Google Drive.
A 1-on-1 class stays a 2-person call, so Meet's 60-minute cap for 3+ people does not apply (the bot made it 3).

- TypeScript + Vite+ (`vp`), same pnpm/Vite/Vitest family as `repos/englishmaile`. `src/background.ts` starts/stops, `src/offscreen.ts` records (chunks -> IndexedDB, upload on stop, recovery on Chrome start), `src/lib/upload.ts` is the Drive resumable upload, `public/manifest.json` is copied as is.
- Build: `pnpm install && pnpm build` -> `dist/`. Load: `chrome://extensions` > Developer mode > Load unpacked > the **`dist/`** folder. Popup > Cài đặt: API base + password.
- Checks: `pnpm check` (format + lint), `pnpm exec tsc --noEmit`, `pnpm test` (unit), `pnpm e2e` (real Chromium against a fake API and Drive; needs `pnpm exec playwright install chromium` once). `scripts/smoke.sh` is the API + real Drive check. See `TESTING.md`.
- What no automated test covers: `tabCapture` (needs a toolbar click) and a real Meet call.

## API contract (built in `repos/englishmaile-api`, `internal/api/extension_handlers.go`)

Both calls send `Authorization: Bearer <EXTENSION_PASSWORD>`; unknown JSON fields are refused.

- `POST /extension/uploads` `{meetUrl,startedAt(ms),size,mimeType:"video/webm"}` -> `{sessionId,folderId,uploadUrl}`. Finds the class by the Meet code in its link (409 `unknown_meeting` if none), picks the lesson nearest `startedAt` (or makes one), makes the Drive folder named like the bot's and opens a resumable upload.
- The extension PUTs the file to `uploadUrl` (no credential needed), Drive answers with the file's `id`.
- `POST /extension/sessions/{sessionId}/complete` `{folderId,fileId,durationSeconds}` -> marks the lesson `completed` with the Drive links.
  No Drive credential ever lives in the extension.
