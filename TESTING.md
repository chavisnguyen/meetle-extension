# Testing the extension, step by step

Nothing here has been run against real Google or a real Meet call yet. Stop at the first thing that fails.

## 0. Already green (no Google)
`cd repos/englishmaile-api/server && go test ./...`, and here `pnpm test`, `pnpm exec tsc --noEmit` and `pnpm e2e`: the built extension in a real Chromium against a fake API and Drive (record -> stop -> upload, and a crash -> reopen -> the leftover uploads). Needs `pnpm exec playwright install chromium` once. It does not cover `tabCapture`, the Google sign-in or real Meet.

## 1. Google setup (once)
See "One-time Google setup" in README.md. You end with a client id.

## 2. The API on your Mac
1. The bot's Drive `token.json` saved on your Mac, e.g. `~/maile-test/token.json` (a throwaway Drive folder if you can).
2. `repos/englishmaile-api/.env` (gitignored):
   ```
   EXTENSION_GOOGLE_CLIENT_ID=<the client id>
   DRIVE_TOKEN_FILE=/Users/<you>/maile-test/token.json
   ```
3. `cd repos/englishmaile-api && make run` (:8080).
4. In the admin (or API), a **teacher whose email is the Google account in your Chrome**, active, and a class taught by them whose Meet link is a real Meet you can open.

## 3. The real extension (10 minutes)
1. Put the client id into `public/manifest.json`, `pnpm install && pnpm build`, then `chrome://extensions` -> Developer mode -> Load unpacked -> `repos/meetle-extension/dist`. Check the extension's ID there is `aajgajillngiplhejehdipnapoimbpmk`.
2. Popup -> Cài đặt: API `http://localhost:8080` (needs `http://localhost/*` in `public/manifest.json` host_permissions, already there for development).
3. Open the class's Meet link, join (a second device or account as the "student"), talk ~2 minutes.
4. Popup: Google asks you to sign in the first time. The class name and a pre-selected lesson must show. Ghi lại (first time: allow the mic in the tab it opens, then press again). Then Dừng & upload; wait for "Đã upload lên Drive."
5. Check: the video plays in Drive with BOTH voices and the screen; the lesson is `completed` with the link.

## 4. What the cases break
- An email that is not an active teacher (or a deactivated one): the popup says so, nothing uploads.
- Close the Meet tab mid-recording: it must stop and upload.
- Quit Chrome mid-recording, reopen it: the leftover uploads on its own (if the sign-in is cached; otherwise at the next recording).
- Record 70+ minutes with 2 people: the call must NOT be cut at 60 minutes. This is the guess behind the whole idea; test it before telling anyone it works.

Before production: remove `http://localhost/*` from `public/manifest.json` host_permissions.
