# Meetle Recorder (Chrome extension)

Records the Google Meet tab from inside the teacher's own browser (video + student's voice + teacher's mic, mixed) and uploads it to Google Drive.
A 1-on-1 class stays a 2-person call, so Meet's 60-minute cap for 3+ people does not apply (the bot made it 3).

- `background.js` starts/stops, `offscreen.js` records (chunks -> IndexedDB, upload on stop, recovery on Chrome start), `lib/upload.js` = Drive resumable upload.
- Load: `chrome://extensions` > Developer mode > Load unpacked > this folder. Popup > Cài đặt: API base + token.
- Check: `node lib/upload.test.mjs`. The recording path itself needs a real Chrome + a Meet tab (not tested headless).

## API contract (built in `repos/englishmaile-api`, `internal/api/extension_handlers.go`)
Both calls send `Authorization: Bearer <EXTENSION_TOKEN>`; unknown JSON fields are refused.
- `POST /extension/uploads` `{meetUrl,startedAt(ms),size,mimeType:"video/webm"}` -> `{sessionId,folderId,uploadUrl}`. Finds the class by the Meet code in its link (409 `unknown_meeting` if none), picks the lesson nearest `startedAt` (or makes one), makes the Drive folder named like the bot's and opens a resumable upload.
- The extension PUTs the file to `uploadUrl` (no credential needed), Drive answers with the file's `id`.
- `POST /extension/sessions/{sessionId}/complete` `{folderId,fileId,durationSeconds}` -> marks the lesson `completed` with the Drive links.
No Drive credential ever lives in the extension.
