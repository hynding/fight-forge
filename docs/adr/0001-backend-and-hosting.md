# ADR 0001: Backend for pack sharing, and hosting the game

- **Status:** Proposed (waiting on Steve's choice of backend)
- **Date:** 2026-11-20
- **Milestone:** M4.1 (unblocks M4.2 to M4.5)

## Context

Phase 4 makes packs shareable online: accounts (M4.2), publishing a pack from the Forge with new versions (M4.2), a gallery with search, covers, author pages and `?pack=<id>` links (M4.3), remixing with attribution, likes and reports (M4.4), and moderation (M4.5).

What we already have and must keep:

- **The game is a static client.** It is Vite + React, with no server. All gameplay is data in content packs.
- **A pack is a bundle.** A bundle is a zip with `pack.json` and asset files (`src/content/bundle.ts`). `readBundle` checks size limits, safe paths, hashes and file types before anything is used. `buildRegistry` validates the content against the zod schemas.
- **Packs are data only.** Nothing in a bundle runs, and loading a pack never contacts a third party, because model URLs must be same-origin.

Constraints:

- **Small team, small budget.** It should cost nothing while usage is low and need little upkeep. There's no one on call.
- **Non-programmer creators.** Sign-in must be ordinary (email link, Google, GitHub). Publishing is one button in the Forge.
- **Server-side checks.** The server must not trust the client. Every upload is validated with the same rules the game uses: the schemas, size limits, file types and a declared license.
- **Moderation is needed.** We need reports, hiding a pack, banning a user, and an audit trail.

## Options considered

| | Supabase | Firebase | Own server (Node + Postgres + S3) | Cloudflare (Workers + D1 + R2) | PocketBase (self-hosted) |
|---|---|---|---|---|---|
| Accounts | Built in (email link, OAuth) | Built in | Build or add a library | Build or add a library | Built in |
| Data | Postgres, SQL, full-text search | Firestore (NoSQL), search needs another service | Postgres | SQLite (D1) | SQLite |
| Pack files | Storage buckets with policies | Cloud Storage with rules | S3 or similar | R2, no egress fees | Local disk / S3 |
| Access control | Row-level security in SQL | Security rules | In our code | In our code | Rules in the admin UI |
| Server-side validation | Edge Functions (Deno, TypeScript): can run our zod schemas and `readBundle` as is | Cloud Functions (Node): can too | Our API: can too | Workers: can too | Hooks in JS/Go |
| Upkeep | Managed | Managed | We run and patch it | Managed, more code of ours | We run and patch it |
| Cost at low use | Free tier (pauses after a week idle on free) | Free tier | A small VM, about $5 to $10 a month | Free tier | A small VM |
| Lock-in | Low: it's Postgres, and it's open source and self-hostable | High | None | Medium | Low |

## Decision (proposed)

**Use Supabase**, unless Steve picks otherwise on the decision card.

- **Accounts:** Supabase Auth with an email magic link, plus GitHub and Google sign-in.
- **Data:** Postgres tables `profiles`, `packs` (id, owner, visibility, current version), `pack_versions` (version, bundle path, size, hash, license, cover path, created), `likes`, `reports` and `moderation_actions`. Row-level security means:
  - only an owner writes their packs;
  - public and unlisted versions are readable by anyone;
  - private ones are readable only by the owner.
- **Files:** a `bundles` bucket. Clients upload to a pending path, and only the server moves a bundle to its public path after validating it. Covers are extracted to a public `covers` bucket for the gallery.
- **Publishing:** an Edge Function `publish-pack`:
  1. Takes the uploaded bundle.
  2. Runs the shared `readBundle` and `buildRegistry` code with the default pack.
  3. Enforces `BUNDLE_LIMITS`, a declared license and a version higher than the last.
  4. Writes the `pack_versions` row.
  5. On any failure, deletes the upload and returns the same error list the Forge already shows.

  The validation code moves into a package both the client and the function import, so the two can't drift.
- **Gallery:** Postgres full-text search on name, description and author, sorted by newest, most liked or most played.
- **Client:** `@supabase/supabase-js` is loaded only on the screens that need it (gallery, publish), so the game itself stays a static, offline-capable client. The project URL and the public anon key are build-time variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). They are meant to be public; security comes from row-level security, not from hiding them. No service-role key is ever in the client or the repository.

### Hosting the game

Serve the game as a static site on **GitHub Pages**, deployed from `main` by `.github/workflows/deploy.yml`.

- It's free, and it lives with the code.
- The game works under the project sub-path `/<repo>/`: Vite's `base` comes from `BASE_PATH` at build time, and content site paths like `/models/x.glb` go through `siteUrl()`.
- `404.html` falls back to the app so `?pack=` links work.

Vercel or Netlify would add preview deploys per PR. That's worth revisiting if reviews need them, and it's a one-file change.

## Consequences

- **Steve needs to set things up once:**
  - Enable Pages (Settings → Pages → Source: GitHub Actions).
  - Create the Supabase project and share its URL and anon key (M4.2).
- **Moderation (M4.5)** uses Supabase's dashboard plus a small admin view. Hiding a pack is a flag the RLS policies respect, and every action is logged in `moderation_actions`.
- **Free-tier projects pause after a week without traffic.** The game still works then, because only the gallery and publishing need the backend. Moving to the paid tier, about $25 a month, removes the pause when it matters.
- **If Supabase stops fitting**, the data is plain Postgres and the files are plain objects, and the validation code is ours. Moving to our own server is a port, not a rewrite.

## If another option is chosen

- **Firebase:** same plan, with Firestore collections instead of tables and Cloud Functions instead of Edge Functions. Search needs an extra service or a simple prefix index.
- **Own server:** a small Node API (Fastify) with Postgres and S3-compatible storage. We'd also need auth (e.g. Lucia or Auth.js), hosting, backups and patching.
