/** Q1 v2: rendert die SV-Kalender-UI den externalBusy-Block? HTML gezielt durchsuchen.
 *  login test-sv -> /gutachter/kalender -> innerHTML nach Busy-Markern. */
import { chromium } from '@playwright/test'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()
const BASE=process.env.SMOKE_STAGING_BASE??'https://app.staging.claimondo.de'
const BA_USER=process.env.STAGING_BASIC_AUTH_USER??'aaroncmdo'; const BA_PASS=process.env.STAGING_BASIC_AUTH_PASS??''
const EMAIL=process.env.SMOKE_SV_EMAIL??'test-sv@claimondo.de'
const OUT=join(ROOT,'docs/31.05.2026/2fa-google-audit'); mkdirSync(OUT,{recursive:true})
const b=await chromium.launch(); const ctx=await b.newContext({httpCredentials:{username:BA_USER,password:BA_PASS},locale:'de-DE',viewport:{width:1440,height:1000}})
const page=await ctx.newPage(); const res={email:EMAIL}
try{
  await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(700)
  await page.fill('input[name="email"], #email',EMAIL); await page.fill('input[name="password"], #password','Test1234!')
  await page.click('button:has-text("Einloggen")'); await page.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:60000})
  await page.goto(`${BASE}/gutachter/kalender`,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(5000)
  res.url=new URL(page.url()).pathname
  const html=await page.content()
  res.hatBusyBlock=/Externer Google-Termin|Privat \(Google\)/.test(html)
  res.busyBlockCount=(html.match(/Externer Google-Termin/g)||[]).length
  res.hatGoogleVerbunden=/Google Calendar verbunden/.test(html)
  res.hatVerbindenBtn=/Google Calendar verbinden/.test(html)
  // Schnipsel um den ersten Busy-Block (zur Sicht-Kontrolle)
  const m=html.search(/Externer Google-Termin|Privat \(Google\)/)
  res.snippet = m>=0 ? html.slice(Math.max(0,m-180), m+80).replace(/\s+/g,' ') : null
  writeFileSync(join(OUT,'sv-kalender-html.html'), html.slice(0,60000))
  await page.screenshot({path:join(OUT,'sv-kalender-ui2.png'),fullPage:true}).catch(()=>{})
}catch(e){res.error=String(e.message).slice(0,200)}
await b.close(); console.log(JSON.stringify(res,null,2))
