# Meetle Recorder (Chrome extension)

Records the Google Meet tab from inside the teacher's own browser (video + student's voice + teacher's mic, mixed) and uploads it to Google Drive.
A 1-on-1 class stays a 2-person call, so Meet's 60-minute cap for 3+ people does not apply (the bot made it 3).

- TypeScript + Vite+ (`vp`), same pnpm/Vite/Vitest family as `repos/englishmaile`. `src/background.ts` starts/stops, `src/offscreen.ts` records (chunks -> IndexedDB, upload on stop, recovery on Chrome start), `src/lib/upload.ts` is the Drive resumable upload, `public/manifest.json` is copied as is.
- Build: `pnpm install && pnpm build` -> `dist/`. Load: `chrome://extensions` > Developer mode > Load unpacked > the **`dist/`** folder. The first time, the popup asks to sign in with the Google account Chrome is signed in to.
- Checks: `pnpm check` (format + lint), `pnpm exec tsc --noEmit`, `pnpm test` (unit), `pnpm e2e` (real Chromium against a fake API and Drive; needs `pnpm exec playwright install chromium` once). `scripts/smoke.sh` is the API + real Drive check. See `TESTING.md`.
- What no automated test covers: `tabCapture` (needs a toolbar click) and a real Meet call.

## API contract (built in `repos/englishmaile-api`, `internal/api/extension_handlers.go`)

Every call sends `Authorization: Bearer <Google access token>` (from `chrome.identity`). The API asks Google whose token it is (only tokens issued to `EXTENSION_GOOGLE_CLIENT_ID` count) and lets in only an email in the **active** teachers (401 = not a valid token, 403 `not_a_teacher`). Unknown JSON fields are refused.

- `GET /extension/sessions?meetUrl=` -> `{className,sessions[],suggestedId}`: what the popup shows, the suggested lesson pre-selected.
- `POST /extension/uploads` `{meetUrl,startedAt(ms),size,mimeType:"video/webm"}` -> `{sessionId,folderId,uploadUrl}`. Finds the class by the Meet code in its link (409 `unknown_meeting` if none), picks the lesson nearest `startedAt` (or makes one), makes the Drive folder named like the bot's and opens a resumable upload.
- The extension PUTs the file to `uploadUrl` (no credential needed), Drive answers with the file's `id`.
- `POST /extension/sessions/{sessionId}/complete` `{folderId,fileId,durationSeconds}` -> marks the lesson `completed` with the Drive links.
  No Drive credential ever lives in the extension.

## One-time Google setup (owner)
1. Google Cloud console -> APIs & Services -> OAuth consent screen: External; scope `.../auth/userinfo.email` only. Add the teachers' emails as test users, or publish the app (email-only scopes should not need Google's verification; check the console says so).
2. Credentials -> Create OAuth client ID -> type **Chrome extension**, Item ID = `aajgajillngiplhejehdipnapoimbpmk` (fixed by the `key` in `public/manifest.json`, so it is the same on every machine).
3. Put the client id in `public/manifest.json` (`oauth2.client_id`, replacing `PASTE-CLIENT-ID...`) and the same value in the API's `EXTENSION_GOOGLE_CLIENT_ID`.
