# Alias consolidated acceptance test

Run this once after replacing the local source files. Use dummy test details and a small closed test cohort only. Do not test with real student identities.

## 1. Local commands

From the project root in PowerShell:

```powershell
npm run lint
npm run build
npm run dev
```

Open `http://localhost:3000`. Record all failures in one list; do not pause to debug feature-by-feature. After the complete pass, group related failures, fix them, and rerun lint/build plus the affected flows.

## 2. Public feed and posting

- Open the homepage in a clean browser context without signing in.
- Confirm the existing test post (`I am a programmer...`) appears under its existing nickname.
- Confirm no real name, age, gender, email or internal author UUID appears in the feed, comment view or page source.
- In an onboarded anonymous test account, publish two test posts a few seconds apart. Refresh the feed and confirm the newer post appears above the older one.
- Confirm the post category, nickname and timestamp are shown.
- Try an empty post and a post longer than 1,000 characters. Both must be blocked.

## 3. No-code onboarding

- In a separate clean browser context, start a new anonymous session from **Write something**.
- Confirm no invitation-code field is shown and no code is required.
- Complete onboarding with dummy real name, nickname, age, and gender; confirm it succeeds and continues to the writing page.
- Confirm an empty real name, nickname, age, or gender is blocked.
- Confirm an already-onboarded account is not asked to create a second private profile.
- Confirm the two pre-existing test profiles continue to work after signing in again.
## 4. Likes and comments

- Like a published post. Confirm the count increases.
- Click again to unlike. Confirm the count decreases.
- Like again and rapidly repeat the like/unlike cycle. Confirm the account rate limit eventually blocks new like events even after unlike.
- Open comments. Confirm published comments are ordered oldest first and show nickname, text and timestamp only.
- Submit a valid comment. Confirm it appears with the private profile nickname.
- Try blank and over-1,000-character comments. Both must be blocked.

## 5. Reporting and moderation

- Submit a post report and a comment report using different test targets.
- Try to report the same post/comment again from the same account. Confirm the duplicate is rejected.
- Sign out of the student session and sign in to the dedicated moderator account at `/admin`.
- Confirm reports appear in the queue with reason, target content and status, without exposing reporter or author UUIDs.
- Change a report status. Confirm the status persists after refresh.
- Hide a post and a comment. Confirm each disappears from the public feed/comment list.
- Restore each item and confirm it appears again.
- Suspend a test author's account for seven days. Confirm the account cannot publish, comment, like or report. Restore access through the report queue and confirm interaction works again.
- Sign in to `/admin` using a non-moderator account. Confirm the account cannot read reports or perform moderation actions, even by direct RPC calls.

## 6. Privacy, authorization and responsive layout

- From a student account, inspect the browser Network responses for `posts`, `comments`, `likes`, `reports` and `private_profiles`. Public post/comment responses must not contain author UUIDs or private profile fields. Other users' like rows and all reports must remain unavailable.
- Confirm one account cannot update/delete another user's posts/comments. Direct table operations must fail or affect zero rows.
- Confirm `/admin` is not sufficient authorization by itself; only the database-registered moderator can read or act on reports.
- Test the homepage, onboarding, writing, comments, reports/rules and `/admin` at a phone-sized viewport. Check that controls fit, text wraps, and no horizontal overflow hides actions.
- Check loading, empty and error states. The public feed must still load when no student session exists.

## 7. Record the release result

Record the exact lint/build outcome, the browser flows completed, any failed checks, the moderator account bootstrap status, and all remaining safety/legal blockers. A successful local test pass does not establish that the school pilot is legally or operationally ready. See the release limitations in `README.md`.
