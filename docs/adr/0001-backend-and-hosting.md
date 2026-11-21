# ADR 0001: Backend for pack sharing, and hosting the game

- **Status:** Accepted (Steve chose our own small server, 2026-11-21)
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

## Decision

**Run our own small server.** Steve chose it for full control and no lock-in. We accept that we'll run, patch and back it up ourselves. The design keeps that upkeep as small as we can.

- **One process, one box.** A Node (TypeScript) API using Fastify lives in `server/` in this repository and is deployed as one container. It is small enough for the cheapest VM or container host (about $5 a month).
- **Data in SQLite, files on disk to start.**
  - SQLite (one file, in WAL mode) holds `users`, `sessions`, `packs` (id, owner, visibility, current version), `pack_versions` (version, size, hash, license, created), `likes`, `reports` and `moderation_actions`.
  - Bundles and covers are stored as files named by their SHA-256.
  - Both sit behind small interfaces (`Store`, `Blobs`), so moving to Postgres or S3-compatible storage later is a contained change, not a rewrite.
  - Backup is a nightly copy of the SQLite file and the blob folder.
- **Accounts.**
  - Sign-in is with GitHub (OAuth), plus an email link once there's a mail sender.
  - No passwords are stored.
  - A session is an opaque random token in an `HttpOnly` cookie. The server keeps only its hash, with an expiry.
  - The game (GitHub Pages) and the API are on different sites, so in production the cookie is `Secure; SameSite=None`. CORS allows only the game's origin.
  - Every state-changing request must carry an `x-fight-forge: 1` header. That forces a CORS preflight, so other sites can't act with the cookie.
- **Publishing.** `POST /packs/:id/versions` takes a bundle and:
  1. Requires a signed-in owner.
  2. Runs the same `readBundle` and `buildRegistry` code the game uses, with the default pack. That code moves into a shared module imported by both the client and the server, so they can't drift.
  3. Enforces `BUNDLE_LIMITS`, a declared license and a version higher than the last.
  4. Stores the bundle and extracts the cover.

  It returns the same error list the Forge already shows. Uploads are size-capped before parsing, and requests are rate-limited per user and per IP.
- **Reading.**
  - `GET /packs` serves the gallery, with search (SQLite FTS5 on name, description and author) and sorting (new, likes, plays).
  - `GET /packs/:id` and `GET /packs/:id/versions/:v/bundle` serve the details and the bundle.
  - Public and unlisted packs are readable by anyone; private ones only by their owner.
  - Bundles are immutable per version, so they're served with long cache headers.
- **Client.** The game stays a static site. It reaches the API at a build-time `VITE_API_URL`. The server allows that one origin with credentials (CORS). Without an API URL, the sharing screens simply don't appear, so the game still works offline and in forks.
- **Secrets.** These live only in the server's environment and never in the repository or the client:
  - the GitHub OAuth client secret;
  - the session signing key;
  - mail credentials.

### Hosting the game

Serve the game as a static site on **GitHub Pages**, deployed from `main` by `.github/workflows/deploy.yml`.

- It's free, and it lives with the code.
- The game works under the project sub-path `/<repo>/`: Vite's `base` comes from `BASE_PATH` at build time, and content site paths like `/models/x.glb` go through `siteUrl()`.
- `404.html` falls back to the app so `?pack=` links work.

Vercel or Netlify would add preview deploys per PR. That's worth revisiting if reviews need them, and it's a one-file change.

## Consequences

- **Upkeep is ours:** OS and dependency updates, backups, uptime. To keep it small:
  - one container;
  - Dependabot for dependency updates;
  - a health check;
  - a daily backup job;
  - `npm audit` in CI.
- **Steve sets up, once (needed for M4.2 to go live, not to build it):**
  - a host for the container (e.g. Fly.io, Render, Railway or a small VPS);
  - a GitHub OAuth app (its client id and secret go into the server's environment);
  - the API's public URL;
  - enabling Pages for the game.
- **Development and tests need no accounts.** The server runs locally with a dev sign-in and temporary SQLite. Its tests run in CI with the rest.
- **Moderation (M4.5)** is an admin role:
  - hiding a pack is a flag every read respects;
  - banning a user ends their sessions;
  - every action is logged in `moderation_actions`.
- **Outgrowing one box** means moving SQLite to Postgres and files to object storage behind the existing interfaces, then running more than one API process.

## Alternatives not taken

- **Supabase** (managed Postgres, auth and storage) was recommended for its lower upkeep. It remains the fallback if running a server becomes a burden; the data model above maps onto it directly.
- **Firebase**: managed, but NoSQL with weak search and high lock-in.
- **Cloudflare Workers + D1 + R2**: cheap, but much of the same code is ours anyway, on a more constrained runtime.
- **PocketBase**: an easy single binary, but its Go/JS hooks would split our validation code from the game's TypeScript.
