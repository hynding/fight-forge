// Starts the API: `npm run server` (see server/README.md for the settings).

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildApp } from './app'
import { diskBlobs } from './blobs'
import { openStore } from './db'

const env = process.env
const dataDir = env.DATA_DIR ?? './server-data'
mkdirSync(dataDir, { recursive: true })

const github =
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.PUBLIC_URL
    ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, callbackUrl: `${env.PUBLIC_URL}/auth/github/callback` }
    : undefined

const app = buildApp(openStore(join(dataDir, 'fight-forge.db')), diskBlobs(join(dataDir, 'blobs')), {
  allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  devLogin: env.DEV_LOGIN === '1',
  github,
  crossSite: env.CROSS_SITE === '1',
  sessionDays: Number(env.SESSION_DAYS) || 30,
  publishPerHour: Number(env.PUBLISH_PER_HOUR) || 20,
})

app.listen({ port: Number(env.PORT) || 8787, host: env.HOST ?? '0.0.0.0' }).then((addr) => {
  console.log(`Fight Forge API on ${addr}${github ? '' : ' (GitHub sign-in off)'}${env.DEV_LOGIN === '1' ? ' (dev sign-in on)' : ''}`)
})
