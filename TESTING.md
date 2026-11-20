# Testing the extension, step by step

Nothing here has been run against real Google or a real Chrome yet. Do it in this order; stop at the first thing that fails.

## 0. Already green (no Google)

`cd repos/englishmaile-api/server && go test ./...`, and here `pnpm test` (unit), `pnpm exec tsc --noEmit`, and `pnpm e2e`: the built extension in a real Chromium against a fake API and Drive (record -> stop -> upload, and a crash -> reopen -> the leftover uploads). Needs `pnpm exec playwright install chromium` once. It does not cover `tabCapture` or real Meet: that is stage B.

## 1. Set up the API on your Mac

1. A Drive `token.json` (the one the bot uses) saved on your Mac, e.g. `~/maile-test/token.json`. Use a throwaway test folder in Drive if you can.
2. `openssl rand -hex 24` -> copy the line, this is the password.
3. Create `repos/englishmaile-api/.env` (gitignored) with:
   ```
   EXTENSION_PASSWORD=<the line>
   DRIVE_TOKEN_FILE=/Users/<you>/maile-test/token.json
   ```
4. `cd repos/englishmaile-api && make run` (serves :8080).
5. A class whose Meet link is a real Meet you can open: create it in the admin (or `curl` the API after `POST /api/login`). Remember its link.

## 2. Stage A: API + real Drive, no Chrome (2 minutes)

`repos/meetle-extension/scripts/smoke.sh http://localhost:8080 <password> <the class's meet link>`
Pass: it prints a file id, then `OK`; a folder "<class> - Buổi n - <date>" with a 5-byte file appears in Drive; the lesson shows `completed` in the admin. Delete the folder afterwards.
Fail here = the server or the Drive credential, not Chrome.

## 3. Stage B: the real extension (10 minutes)

1. `pnpm install && pnpm build`, then `chrome://extensions` -> Developer mode -> Load unpacked -> `repos/meetle-extension/dist`.
2. Popup -> Cài đặt: API `http://localhost:8080`, Token = the password.
3. Open the class's Meet link in Chrome, join the call (a second device or account as the "student"), talk for ~2 minutes.
4. Popup: the class name and a pre-selected lesson must show. Bấm "Ghi lại tab này" (first time: allow the mic in the tab it opens, then press again).
5. Bấm "Dừng & upload". Wait for "Đã upload lên Drive."
6. Check: the video plays in Drive with BOTH voices and the screen; the lesson is `completed` with the link.

## 4. Stage C: what the cases break

- Close the Meet tab mid-recording: it must stop and upload.
- Quit Chrome mid-recording, reopen it: the leftover must upload on its own (needs the password saved).
- Wrong password: popup shows an error, nothing is lost (the video stays in Chrome).
- Record for 70+ minutes with 2 people: the call must NOT be cut at 60 minutes. This is the guess behind the whole idea; test it before telling anyone it works.

Before production: remove `http://localhost/*` from `public/manifest.json` host_permissions.
