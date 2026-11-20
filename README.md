# Meetle Recorder (Chrome extension)

Records the Google Meet tab from inside the teacher's own browser (video + student's voice + teacher's mic, mixed) and uploads it to Google Drive.
A 1-on-1 class stays a 2-person call, so Meet's 60-minute cap for 3+ people does not apply (the bot made it 3).

- TypeScript + Vite+ (`vp`), same pnpm/Vite/Vitest family as `repos/englishmaile`. `src/background.ts` starts/stops, `src/offscreen.ts` records (chunks -> IndexedDB, upload on stop, recovery on Chrome start), `src/lib/upload.ts` is the Drive resumable upload, `public/manifest.json` is copied as is.
- Build: `pnpm install && pnpm build` -> `dist/`. Load: `chrome://extensions` > Developer mode > Load unpacked > the **`dist/`** folder. The first time, the popup opens a Google sign-in window that returns to the API.
- Checks: `pnpm check` (format + lint), `pnpm exec tsc --noEmit`, `pnpm test` (unit), `pnpm e2e` (real Chromium against a fake API and Drive; needs `pnpm exec playwright install chromium` once). `scripts/smoke.sh` is the API + real Drive check. See `TESTING.md`.
- What no automated test covers: `tabCapture` (needs a toolbar click) and a real Meet call.

## API contract (built in `repos/englishmaile-api`, `internal/api/extension_handlers.go`)

Sign-in: `chrome.identity.launchWebAuthFlow` opens `GET /extension/login?redirect=<chromiumapp.org URL>`, which sends the browser to Google. Google comes back to the API's **one** callback `/api/google/callback` (the same one the admin's "Connect Google" uses; the OAuth `state` says whose sign-in it is). For a teacher the API checks the email is in the **active** teachers, and redirects to the extension with `#token=<random>` (30 days, signed with HMAC using the Google client secret; nothing is stored) or `?error=not_a_teacher|login_failed`.
Every other call sends `Authorization: Bearer <that token>` (401 = unknown/expired, 403 `not_a_teacher` = no longer an active teacher). Unknown JSON fields are refused.

- `GET /extension/sessions?meetUrl=` -> `{className,sessions[],suggestedId}`: what the popup shows, the suggested lesson pre-selected.
- `POST /extension/uploads` `{meetUrl,startedAt(ms),size,mimeType:"video/webm"}` -> `{sessionId,folderId,uploadUrl}`. Finds the class by the Meet code in its link; if none has it, the file goes into the Drive folder `Other` (made on first use) as `Meet <code> <date time>.webm` and `sessionId` is empty (nothing to complete). Otherwise it picks the lesson nearest `startedAt` (or makes one), makes the Drive folder named like the bot's and opens a resumable upload.
- The extension PUTs the file to `uploadUrl` (no credential needed), Drive answers with the file's `id`.
- `POST /extension/sessions/{sessionId}/complete` `{folderId,fileId,durationSeconds}` -> marks the lesson `completed` with the Drive links.
  No Drive credential ever lives in the extension.

## One-time Google setup (owner)

None: it uses the OAuth client and the redirect URI the admin's "Connect Google" already has (`API_PUBLIC_URL/api/google/callback`). The `openid email` scope it asks for needs no verification. While the OAuth consent screen is in Testing, the teachers' emails must be listed as test users.
