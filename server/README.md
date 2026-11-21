# Fight Forge API

The server behind pack sharing: accounts, publishing packs with new versions, and reading them back. Why it's built this way: [docs/adr/0001-backend-and-hosting.md](../docs/adr/0001-backend-and-hosting.md).

- `app.ts`: the routes (Fastify). Uploaded bundles go through the game's own `readBundle` and `buildRegistry` checks.
- `db.ts`: users, sessions, packs, versions, likes, reports and the moderation log in SQLite (`node:sqlite`), with full-text search.
- `blobs.ts`: bundles and covers stored by SHA-256, on disk.
- `index.ts`: reads the settings below and starts the server.

## Run it locally

```sh
DEV_LOGIN=1 npm run server          # API on http://localhost:8787, data in ./server-data
VITE_API_URL=http://localhost:8787 npm run dev   # the game, with Publish in the Forge
```

`DEV_LOGIN=1` allows signing in by just typing a name. Never turn it on in production.

## Settings (environment variables)

| Variable | Meaning | Default |
|---|---|---|
| `PORT`, `HOST` | Where to listen | `8787`, `0.0.0.0` |
| `DATA_DIR` | SQLite file and blobs; back this folder up | `./server-data` |
| `ALLOWED_ORIGINS` | The game's origins, comma-separated (CORS with cookies) | `http://localhost:5173` |
| `PUBLIC_URL` | The API's own public URL, for the GitHub callback | none |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | A GitHub OAuth app; set all three to turn on GitHub sign-in | none |
| `CROSS_SITE` | `1` when the game and API are on different sites (sends `Secure; SameSite=None` cookies; needs HTTPS) | off |
| `SESSION_DAYS` | How long a sign-in lasts | `30` |
| `PUBLISH_PER_HOUR` | Publishes allowed per user per hour | `20` |
| `REPORTS_PER_HOUR` | Reports allowed per user per hour | `10` |
| `WRITES_PER_IP_PER_HOUR` | State-changing requests (publish, like, report, sign-in) per IP address per hour | `600` |
| `ADMINS` | Moderators, comma-separated `provider:name`, e.g. `github:hynding`; they get the admin role at sign-in | none |
| `DEV_LOGIN` | `1` allows sign-in by name (development only) | off |

The GitHub OAuth app's callback URL is `<PUBLIC_URL>/auth/github/callback`.

## Going live

1. Build the container with `docker build -f server/Dockerfile -t fight-forge-api .` and run it on any container host. Mount a persistent volume at `/data`.
2. Create a GitHub OAuth app (GitHub → Settings → Developer settings → OAuth Apps):
   - homepage: the game's URL;
   - callback: `<PUBLIC_URL>/auth/github/callback`.

   Set the client id and secret in the host's environment.
3. Set `ALLOWED_ORIGINS` to the game's origin (e.g. `https://hynding.github.io`), and set `CROSS_SITE=1` and `PUBLIC_URL`.
4. Build the game with `VITE_API_URL=<PUBLIC_URL>`. For GitHub Pages, add it as a repository variable and pass it in the deploy workflow.
5. Set `ADMINS` to whoever moderates (e.g. `github:hynding`).
6. Back up `DATA_DIR` daily.

## API

All state-changing requests need the header `x-fight-forge: 1`. It forces a CORS preflight, so other sites can't act with a user's cookie.

| | |
|---|---|
| `GET /config` | `{ devLogin, github }` |
| `GET /me` | The signed-in user, or 401 |
| `GET /auth/github?return=<game url>` | Starts GitHub sign-in and returns to the game |
| `POST /auth/dev` `{ name }` | Dev sign-in (only with `DEV_LOGIN=1`) |
| `POST /auth/logout` | Ends the session |
| `POST /packs?visibility=public\|unlisted\|private` | Body: the bundle (`application/zip`). Publishes a new version. Errors: 401 not signed in, 403 someone else's id, 409 version not newer, 422 invalid pack (`errors` as in the game), 429 too many publishes |
| `PATCH /packs/:id` `{ visibility }` | The owner changes who can see it |
| `DELETE /packs/:id` | The owner (or an admin) removes the pack and its versions |
| `POST /packs/:id/like` `{ liked }` | Like or unlike |
| `POST /packs/:id/report` `{ reason }` | Report a pack to the moderators (one open report per person per pack) |
| `GET /packs?q=&owner=&sort=new\|name\|likes&limit=&offset=` | The public gallery, with search |
| `GET /me/packs` | Your packs, any visibility |
| `GET /packs/:id` | A pack, its versions, whether you like it, what it remixes and its remixes |
| `GET /packs/:id/versions/:version/bundle` | The bundle; immutable, so it's cached |
| `GET /packs/:id/cover` | The cover image |

### Moderation (admins only)

Taken-down packs, and every pack of a banned user, disappear from the gallery and links; their owners still see them, marked `hidden`. Every action is logged with its moderator and note.

| | |
|---|---|
| `GET /admin/reports` | Open reports, with the pack and who reported it |
| `POST /admin/packs/:id/hidden` `{ hidden, note }` | Take a pack down or put it back; closes its open reports |
| `POST /admin/reports/:id/dismiss` `{ note }` | Close a pack's open reports without acting |
| `POST /admin/packs/:id/owner-banned` `{ banned, note }` | Ban or unban the pack's owner; a ban ends their sessions |
| `GET /admin/actions` | The moderation log, newest first |
