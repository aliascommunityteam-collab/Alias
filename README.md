# Alias MVP

Alias is a small student discussion platform built with Next.js 16, TypeScript, Tailwind CSS, and Supabase. Students can browse published posts without signing in. Writing, liking, commenting, and reporting require an anonymous session with completed private onboarding.

## Implemented in this source package

- Chronological public feed (newest first), with loading, empty and error states.
- Text-only posts with category, nickname and timestamp.
- Likes with a database primary key that prevents duplicate likes per account.
- Public comment display using a nickname snapshot; internal author UUIDs are not selected by the public UI.
- Private post/comment reports with a one-target constraint and duplicate-report indexes.
- Moderator queue, report status, hide/remove/restore actions, 7-day account suspension and suspension removal.
- No-code anonymous onboarding. The database grants an internal access marker only after a private profile has been validated and created.
- Community rules and a clear explanation that Alias is pseudonymous, not completely anonymous.
- Database-side rolling rate limits per anonymous account: 3 posts per 15 minutes, 8 comments per 10 minutes, 40 likes per hour, and 5 reports per hour. Like/unlike cycling does not reset the limit.

The uploaded project already contained the first version of the chronological feed. This sprint retained it and integrated the interaction features into the existing design rather than replacing the app's visual system.

See [`TESTING.md`](./TESTING.md) for the consolidated local lint/build and browser acceptance pass.

## Local setup

Use Node.js 24 and npm (the project was originally developed with Node 24.18.0 and npm 11.16.0).

```powershell
npm ci
```

Create or preserve `.env.local` in the project root. The browser client reads these two **public** Supabase values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use the project's publishable key (or legacy anon key if that is what the project currently uses). Never put a `service_role` or secret API key in a `NEXT_PUBLIC_` variable or browser code. Do not share `.env.local` when uploading source archives.

Then run:

```powershell
npm run lint
npm run build
npm run dev
```

Open `http://localhost:3000`.

## Moderator bootstrap

A moderator account is deliberately separate from the anonymous student session.

1. A responsible adult should create a dedicated email/password Auth account in the Alias Supabase project's Authentication → Users area. Do not use a student's anonymous user as moderator.
2. Sign in to the app's `/admin` route with that account. If the browser currently holds an anonymous student session, sign out first.
3. The page displays that account's Auth user UUID and a SQL statement. Confirm that the account belongs to the responsible adult, then run the displayed `INSERT` in the Alias project's SQL Editor.
4. Refresh `/admin`. The account should now pass the database-side moderator check.

Moderator authorization is stored in `private.alias_moderators`, a non-exposed schema. Hiding `/admin` or hiding buttons is not the security control; privileged database functions check the moderator record themselves.

## Access model and existing accounts

- Students do not need an invitation code.
- New anonymous sessions complete private onboarding before creating posts, commenting, liking, or reporting.
- Onboarding validates the required details and creates one private profile for the anonymous account.
- The database creates an internal access marker after successful no-code onboarding. This is an authorization record, not a user-entered invitation.
- The two private profiles that existed before the no-code flow are preserved.
- The existing test post is preserved.

No school membership verification is implemented in this MVP. Keep the service restricted to controlled testing until the student safeguarding, privacy, and operational release gates have been reviewed.
## Database and migration notes

The migrations present in `supabase/migrations` include the Alias feature changes applied to the connected Supabase project. The remote migration history also contains four migrations (`20261101165330`, `20261102190646`, `20261102190711`, and `20261106075830`) whose SQL files were not present in the original source archive. Their source must be recovered before claiming that this folder can rebuild a fresh database from zero. The 7 November rate-limit identity fix is recorded locally as `20261107135203_fix_alias_rate_limit_authenticated_identity.sql`.
The live database uses PostgreSQL 17. The feature schema adds private invite/moderator/suspension tables, adds `comments.author_nickname`, and installs RLS policies, functions and triggers. The changes preserve the existing posts and private profile rows.

## Privacy boundary

Other students see a nickname, post/comment content and timestamps. The public feed does not select the post author UUID. Public comment reads expose the nickname snapshot and comment text, not the internal author UUID. Reports are readable only by authorized moderators. Private profile rows (real name, age and gender) are not publicly readable and direct profile insertion is revoked; onboarding inserts through a database function after successful no-code onboarding validation.

This is not complete anonymity. Supabase Auth still maintains an internal account identifier; Alias stores private profile details; authorized project operators and service providers may be able to access data under their platform privileges. The app does not provide end-to-end anonymity, encrypted private messaging, or an emergency reporting service.

## Safety and release limitations

**Do not open this to a wider student audience until all gates have been independently reviewed.** In particular:

- No moderator alerting or on-call notification is configured. Reports wait in the queue until a moderator checks `/admin`; the queue is not continuously monitored.
- A responsible adult moderator account has not yet been bootstrapped unless the project owner has completed the steps above.
- There is no parent/guardian consent capture or age-assurance flow. Because this is intended for students and may process data about minors, the operator must obtain qualified India privacy/legal review and determine the lawful basis and required verifiable parental consent before processing children's personal data or inviting minors. The current UI's age field is not consent.
- Review the project's data location and cross-border data handling. The connected Supabase project reports region `ap-northeast-2`; disclose data handling accurately and obtain appropriate review before student use.
- No school safeguarding workflow, named safety contact, grievance/data-rights workflow, or documented incident-response rota is built into the product.
- A trusted adult/school safeguarding contact must own urgent response. The rules page tells users not to wait for an in-app report when someone may be in immediate danger.

Until those points have been addressed, keep Alias restricted to controlled internal testing. The 8 November 2026 target date does not override the safety gates.

## Out of scope

Direct messages, public profiles, followers, photos/video uploads, AI/recommendation features, gamification, multi-school support and unrestricted registration are not included.
