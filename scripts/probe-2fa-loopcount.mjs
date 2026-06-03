/**
 * Zaehlt die Navigations-Bounces /admin <-> /login/2fa fuer einen 2FA-OFF-User
 * ohne claimondo_2fa_verified-Cookie. Hart gedeckelt. READ-ONLY.
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
const ctx=await browser.newContext({httpCredentials:{username:BA_USER,password:BA_PASS},locale:'de-DE'})
const page=await ctx.newPage()
const navs=[]
page.on('framenavigated',(f)=>{ if(f===page.mainFrame()) navs.push(new URL(f.url()).pathname) })
try{
  await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(700)
  await page.fill('input[name="email"], #email','test-admin@claimondo.de')
  await page.fill('input[name="password"], #password','Test1234!')
  await page.click('button:has-text("Einloggen")')
  await page.waitForURL((u)=>!u.pathname.startsWith('/login'),{timeout:60000})
  await ctx.clearCookies({name:'claimondo_2fa_verified'})
  navs.length=0
  await page.goto(`${BASE}/admin`,{waitUntil:'commit',timeout:8000}).catch(()=>{})
  await page.waitForTimeout(6000)
}catch(e){ console.log('note:',String(e.message).split('\n')[0]) }
await browser.close()
const counts=navs.reduce((m,p)=>{m[p]=(m[p]||0)+1;return m},{})
console.log(JSON.stringify({ totalNavs:navs.length, counts, first12:navs.slice(0,12) },null,2))
