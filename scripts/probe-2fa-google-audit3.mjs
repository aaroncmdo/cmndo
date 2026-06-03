/**
 * Round-3 — Mechanik festnageln:
 *  A3) Klassifiziere den /login/2fa-Body (Error-Boundary? leeres Render?
 *      stiller Redirect?) — Regex-Treffer + <title> + Vergleich MIT vs OHNE
 *      claimondo_2fa_verified-Cookie.
 *  B3) Google-Login-Button decisive: Request-Interception (faengt auch
 *      fetch/XHR zu supabase.co/auth/v1/authorize) + unhandledrejection-Capture.
 * READ-ONLY.
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url)); const ROOT = join(__dirname, '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const line of readFileSync(p,'utf-8').split('\n')){const t=line.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()
const BASE=process.env.SMOKE_STAGING_BASE??'https://app.staging.claimondo.de'
const BA_USER=process.env.STAGING_BASIC_AUTH_USER??'aaroncmdo'; const BA_PASS=process.env.STAGING_BASIC_AUTH_PASS??''
const PW='Test1234!'; const ADMIN_EMAIL='test-admin@claimondo.de'
if(!BA_PASS){console.error('STAGING_BASIC_AUTH_PASS fehlt');process.exit(2)}
const BASIC='Basic '+Buffer.from(`${BA_USER}:${BA_PASS}`).toString('base64')
const OUT=join(ROOT,'docs/31.05.2026/2fa-google-audit'); mkdirSync(OUT,{recursive:true})
const out={ts:new Date().toISOString()}
const classify=(b)=>({
  title:(b.match(/<title>([^<]*)<\/title>/i)||[])[1]||null,
  hasTwoFa:/Zwei-Faktor/i.test(b),
  hasWeiterleitung:/Weiterleitung/i.test(b),
  appError:/Application error|client-side exception|something went wrong/i.test(b),
  hasErrorDigest:/"digest"|error\.digest|__next_error/i.test(b),
  mentionsAdmin:/\/admin(?![a-z])/i.test(b),
  redirectMarker:/NEXT_REDIRECT/i.test(b),
  emptyMain:/id="main-content"[^>]*>\s*<\/(main|div)>/i.test(b),
  bodyLen:b.length,
})
const browser=await chromium.launch()

// A3
{
  const ctx=await browser.newContext({httpCredentials:{username:BA_USER,password:BA_PASS},locale:'de-DE'})
  const page=await ctx.newPage(); const A={}
  try{
    await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(700)
    await page.fill('input[name="email"], #email',ADMIN_EMAIL); await page.fill('input[name="password"], #password',PW)
    await page.click('button:has-text("Einloggen")')
    await page.waitForURL((u)=>!u.pathname.startsWith('/login'),{timeout:60000})
    // MIT Cookie (frisch nach Login) — rendert /login/2fa was?
    const withCookie=await ctx.request.get(`${BASE}/login/2fa`,{headers:{Authorization:BASIC},maxRedirects:0})
    A.withCookie={status:withCookie.status(),location:withCookie.headers()['location']??null,...classify(await withCookie.text())}
    // OHNE Cookie
    await ctx.clearCookies({name:'claimondo_2fa_verified'})
    const without=await ctx.request.get(`${BASE}/login/2fa`,{headers:{Authorization:BASIC},maxRedirects:0})
    A.withoutCookie={status:without.status(),location:without.headers()['location']??null,...classify(await without.text())}
    // Und /admin ohne Cookie nochmal (Beweis Middleware-Bounce)
    const adminNo=await ctx.request.get(`${BASE}/admin`,{headers:{Authorization:BASIC},maxRedirects:0})
    A.adminWithout={status:adminNo.status(),location:adminNo.headers()['location']??null}
  }catch(e){A.error=String(e.message).slice(0,200)}
  out.A3=A; await ctx.close()
}

// B3
{
  const ctx=await browser.newContext({httpCredentials:{username:BA_USER,password:BA_PASS},locale:'de-DE'})
  const page=await ctx.newPage(); const B={authorizeRequests:[],rejections:[]}
  await page.addInitScript(()=>{window.addEventListener('unhandledrejection',(e)=>{(window.__rej=window.__rej||[]).push(String(e.reason).slice(0,200))})})
  page.on('request',(r)=>{const u=r.url();if(u.includes('auth/v1/authorize')||u.includes('accounts.google.com'))B.authorizeRequests.push(u.slice(0,160))})
  try{
    await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(700)
    const tab=page.getByRole('button',{name:'Google',exact:true}); if(await tab.count())await tab.first().click()
    await page.waitForTimeout(400)
    const btn=page.getByRole('button',{name:/Mit Google anmelden/i})
    B.btnFound=(await btn.count())>0
    if(B.btnFound){await btn.first().click({timeout:5000}).catch((e)=>{B.clickErr=String(e.message).slice(0,120)}); await page.waitForTimeout(4000)}
    B.finalUrl=page.url().slice(0,200)
    B.rejections=await page.evaluate(()=>window.__rej||[]).catch(()=>[])
  }catch(e){B.error=String(e.message).slice(0,200)}
  out.B3=B; await ctx.close()
}

await browser.close()
writeFileSync(join(OUT,'findings3.json'),JSON.stringify(out,null,2))
console.log(JSON.stringify(out,null,2)); console.log('\nDONE round-3')
