/**
 * Re-Verify (gegen Staging, AKTUELLER Code ohne Fix): Tut der
 * "Mit Google anmelden"-Button wirklich nichts, oder war der no-op ein
 * Hydration-Timing-Artefakt der frueheren Probes?
 *
 * Methode: erst Hydration BEWEISEN (Telefon-Tab klicken → Telefon-Feld muss
 * erscheinen), dann Google-Tab, dann Button — und auf NETZWERK-Ebene jede
 * Anfrage an supabase /auth/v1/authorize bzw. accounts.google.com fangen
 * (faengt den Redirect auch wenn er schnell ist). READ-ONLY (kein Consent).
 */
import { chromium } from '@playwright/test'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url)); const ROOT = join(__dirname, '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()
const BASE=process.env.SMOKE_STAGING_BASE??'https://app.staging.claimondo.de'
const BA_USER=process.env.STAGING_BASIC_AUTH_USER??'aaroncmdo'; const BA_PASS=process.env.STAGING_BASIC_AUTH_PASS??''
if(!BA_PASS){console.error('STAGING_BASIC_AUTH_PASS fehlt');process.exit(2)}
const OUT=join(ROOT,'docs/31.05.2026/2fa-google-audit'); mkdirSync(OUT,{recursive:true})

const browser=await chromium.launch()
const ctx=await browser.newContext({httpCredentials:{username:BA_USER,password:BA_PASS},locale:'de-DE',viewport:{width:1366,height:900}})
const page=await ctx.newPage()
const authReqs=[]; const consoleErrs=[]
page.on('request',r=>{const u=r.url(); if(u.includes('auth/v1/authorize')||u.includes('accounts.google.com'))authReqs.push(u.slice(0,180))})
page.on('console',m=>{if(m.type()==='error')consoleErrs.push(m.text().slice(0,180))})
page.on('pageerror',e=>consoleErrs.push('pageerror: '+String(e.message).slice(0,180)))
await page.addInitScript(()=>{window.addEventListener('unhandledrejection',e=>{(window.__rej=window.__rej||[]).push(String(e.reason).slice(0,180))})})

const res={base:BASE}
try{
  await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:45000})
  await page.waitForTimeout(3000) // Hydration-Zeit geben
  // HYDRATION-BEWEIS: Telefon-Tab → Telefon-Feld sichtbar?
  await page.getByRole('button',{name:'Telefon',exact:true}).click().catch(()=>{})
  await page.waitForTimeout(600)
  res.hydrationProof_phoneFieldVisible = await page.getByPlaceholder('+49 170 1234567').isVisible().catch(()=>false)
  // Google-Tab
  await page.getByRole('button',{name:'Google',exact:true}).click().catch(()=>{})
  await page.waitForTimeout(600)
  const btn=page.getByRole('button',{name:/Mit Google anmelden/i})
  res.googleBtnVisible=(await btn.count())>0
  // KLICK
  await btn.first().click({timeout:5000}).catch(e=>{res.clickErr=String(e.message).slice(0,140)})
  await page.waitForTimeout(6000)
  res.rejections=await page.evaluate(()=>window.__rej||[]).catch(()=>[])
  res.finalUrl=page.url().slice(0,200)
  res.authReqs=authReqs
  res.consoleErrs=consoleErrs
  res.firedAuthorize=authReqs.some(u=>u.includes('auth/v1/authorize'))
  res.reachedGoogle=authReqs.some(u=>u.includes('accounts.google.com'))
  res.leftLogin=!new URL(page.url()).pathname.startsWith('/login')
  res.VERDICT = (res.firedAuthorize||res.reachedGoogle||res.leftLogin)
    ? 'BUTTON FUNKTIONIERT (war Hydration-Artefakt)'
    : (res.hydrationProof_phoneFieldVisible
        ? 'BUTTON NO-OP TROTZ HYDRATION = ECHTER BUG'
        : 'UNKLAR (Hydration nicht bewiesen)')
  await page.screenshot({path:join(OUT,'reverify-google-button.png'),fullPage:true}).catch(()=>{})
}catch(e){res.error=String(e.message).slice(0,200)}
await browser.close()
console.log(JSON.stringify(res,null,2))
