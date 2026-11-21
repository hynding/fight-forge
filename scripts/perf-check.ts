// The frame-time budget check: plays the Stress Test sample (32 enemies at
// once) in Chromium and reports frame times and renderer counts from the
// game's own perf monitor (sceneProbe.perf), failing if the 95th-percentile
// frame is over the budget (16.7 ms, 60 fps) times --slack.
//
//   npm run perf                       headless (software WebGL: expect it to be slow)
//   npm run perf -- --headed           a real window and GPU: the meaningful number
//   npm run perf -- --slack 2 --seconds 8
//
// Needs Playwright with Chromium (npx playwright install chromium); it isn't a
// dependency of the game.

import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { FRAME_BUDGET_MS, type PerfSnapshot } from '../src/sim/perf'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const num = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : fallback
}
const headed = flag('headed')
const slack = num('slack', 1)
const seconds = num('seconds', 5)

const require = createRequire(import.meta.url)
let chromium: typeof import('playwright').chromium
try {
  chromium = require('playwright').chromium
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium')
  process.exit(2)
}

const server = await createServer({ logLevel: 'error', server: { port: 5299 } })
await server.listen()
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5299/'
const browser = await chromium.launch(headed ? { headless: false } : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
let code = 0
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.error('page error:', e.message))
  await page.goto(url)
  // Page code goes in as strings: vite-node would rewrite import() inside functions.
  const started = (await page.evaluate(`(async () => {
    const { installBundleFromUrl } = await import('/src/content/library.ts')
    const { siteUrl } = await import('/src/content/siteUrl.ts')
    const r = await installBundleFromUrl(siteUrl('/packs/stress-test.zip'))
    if (!r.ok) return 'the Stress Test pack did not install'
    const { getLevels } = await import('/src/content/active.ts')
    const { useGameStore } = await import('/src/store/gameStore.ts')
    const i = getLevels().findIndex((l) => l.id === 'stress')
    if (i < 0) return 'no stress level'
    useGameStore.getState().startRun(i)
    return null
  })()`)) as string | null
  if (started) throw new Error(started)
  await page.waitForFunction(() => document.querySelector('[data-meter]'), null, { timeout: 60000 })
  // Walk into the locked fight so the second wave joins the first.
  await page.keyboard.down('d')
  await page.waitForTimeout(2000)
  await page.keyboard.up('d')
  await page.waitForTimeout(seconds * 1000)
  const perf = (await page.evaluate(`import('/src/sim/probe.ts').then((m) => m.sceneProbe.perf())`)) as PerfSnapshot | null
  if (!perf) throw new Error('no perf snapshot (is PerfMonitor mounted?)')
  const limit = FRAME_BUDGET_MS * slack
  console.log(`Stress Test, ${headed ? 'headed' : 'headless (software WebGL)'}, ${perf.frames} frames`)
  console.log(`  fighters      ${perf.fighters}`)
  console.log(`  frame avg     ${perf.avg.toFixed(1)} ms (${perf.fps.toFixed(0)} fps)`)
  console.log(`  frame p95     ${perf.p95.toFixed(1)} ms (limit ${limit.toFixed(1)} ms)`)
  console.log(`  worst frame   ${perf.worst.toFixed(1)} ms; ${(perf.overBudget * 100).toFixed(0)}% over ${FRAME_BUDGET_MS.toFixed(1)} ms`)
  console.log(`  draw calls    ${perf.drawCalls}; triangles ${perf.triangles}; geometries ${perf.geometries}; textures ${perf.textures}`)
  if (perf.p95 > limit) {
    console.log('OVER BUDGET')
    code = 1
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  code = 2
} finally {
  await browser.close()
  await server.close()
}
process.exit(code)
