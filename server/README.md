# Fight Forge API

The server behind pack sharing: accounts, publishing packs with new versions, and reading them back. Why it's built this way: [docs/adr/0001-backend-and-hosting.md](../docs/adr/0001-backend-and-hosting.md).

- `app.ts`: the routes (Fastify). Uploaded bundles go through the game's own `readBundle` and `buildRegistry` checks.
- `db.ts`: users, sessions, packs and versions in SQLite (`node:sqlite`), with full-text search.
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
5. Back up `DATA_DIR` daily.

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
| `GET /packs?q=&sort=new\|name&limit=&offset=` | The public gallery, with search |
| `GET /me/packs` | Your packs, any visibility |
| `GET /packs/:id` | A pack and its versions |
| `GET /packs/:id/versions/:version/bundle` | The bundle; immutable, so it's cached |
| `GET /packs/:id/cover` | The cover image |
