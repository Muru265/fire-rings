// Time-to-rings on a throttled 4G profile (9 Mbps down, 1.5 Mbps up, 170 ms RTT), cold cache.
// Usage: node scripts/perf.mjs [url]   (default: local vite preview of /r/punjab)
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const arg = process.argv[2]
const PORT = 4179
let server
if (!arg) {
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
  for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}`); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
}
const url = arg ?? `http://localhost:${PORT}/r/punjab`
const browser = await chromium.launch()
const results = []
for (let run = 0; run < 3; run++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: (9e6 / 8), uploadThroughput: (1.5e6 / 8) })
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'commit' })
  await page.waitForSelector('svg[role="grid"] [role="gridcell"]', { timeout: 30000 })
  results.push(Date.now() - t0)
  await ctx.close()
}
console.log(`${url} time-to-rings on 4G (ms):`, results.join(', '), '· median', results.sort((a, b) => a - b)[1])
await browser.close()
if (server) { server.kill(); if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) }
