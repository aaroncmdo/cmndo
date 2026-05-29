/**
 * Clarity-Consent-Gate Smoke (kfzgutachter-LP). Verifiziert:
 *   pre  : KEIN clarity.ms vor Consent (DSGVO-Gate zu)
 *   A cc_cookie(analytics) + 'claimondo:consent-changed'         -> Clarity laedt (CMP-Pfad)
 *   B dataLayer.push(['consent','update',{analytics_storage}])   -> Clarity laedt (GCM-Array)
 *   C gtag('consent','update',{analytics_storage:'granted'})     -> Clarity laedt (GCM-Arguments, der reale Fall)
 * B+C decken die native-GCM-Pfade ab (Polling + Array/Arguments-Detection).
 *
 * Staging:   node scripts/smoke-clarity-lp-staging.mjs            (Basic-Auth aus .env.local)
 * Lokal:     SMOKE_STAGING_BASE=http://localhost:3000 node scripts/smoke-clarity-lp-staging.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
function loadEnv() {
  const p = join(ROOT, '.env.local'); if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 0) continue
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnv()
const BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const BA_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BA_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''
const OUT = join(ROOT, 'docs/29.05.2026/smoke-clarity-lp')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
async function runCase(name, prep) {
  const ctx = await browser.newContext({
    httpCredentials: BA_PASS ? { username: BA_USER, password: BA_PASS } : undefined,
    locale: 'de-DE', viewport: { width: 1440, height: 960 },
  })
  const page = await ctx.newPage()
  const reqs = []
  page.on('request', (r) => { if (/clarity\.ms/i.test(r.url())) reqs.push(r.url()) })
  try { await page.goto(BASE + '/kfzgutachter-lp', { waitUntil: 'domcontentloaded', timeout: 60000 }) } catch (e) { console.error(name, 'goto', e.message) }
  await page.waitForTimeout(3500)
  const pre = reqs.length
  await prep(page)
  await page.waitForTimeout(6000) // Polling-Fenster (~500ms-Takt) abdecken
  const post = reqs.length
  await page.screenshot({ path: join(OUT, name + '.png') })
  await ctx.close()
  return { name, pre, post, inits: post > 0 }
}

const A = await runCase('A-cc-cookie-event', async (page) => {
  await page.evaluate(() => {
    document.cookie = 'cc_cookie=' + encodeURIComponent(JSON.stringify({ categories: ['necessary', 'analytics', 'ads'], revision: 0, data: null })) + '; path=/'
    window.dispatchEvent(new Event('claimondo:consent-changed'))
  })
})
const B = await runCase('B-datalayer-array', async (page) => {
  await page.evaluate(() => {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push(['consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }])
  })
})
const C = await runCase('C-gtag-arguments', async (page) => {
  await page.evaluate(() => {
    if (typeof window.gtag === 'function') window.gtag('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' })
    else { window.dataLayer = window.dataLayer || []; function gtag() { window.dataLayer.push(arguments) } gtag('consent', 'update', { analytics_storage: 'granted' }) }
  })
})

console.log(JSON.stringify({ base: BASE, A, B, C }, null, 2))
console.log('VERDICT  A_cmp=' + A.inits + '  B_gcm_array=' + B.inits + '  C_gcm_gtag=' + C.inits)
await browser.close()
