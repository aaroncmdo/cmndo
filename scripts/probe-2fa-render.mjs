/**
 * Minimal: klassifiziert was /login/2fa fuer einen 2FA-OFF-User OHNE
 * claimondo_2fa_verified-Cookie zurueckgibt — Error-Boundary vs. Redirect vs.
 * leeres Render. READ-ONLY. Kein Google-Teil (der hing).
 */
import { chromium } from '@playwright/test'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url)); const ROOT = join(__dirname, '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()
const BASE=process.env.SMOKE_STAGING_BASE??'https://app.staging.claimondo.de'
const BA_USER=process.env.STAGING_BASIC_AUTH_USER??'aaroncmdo'; const BA_PASS=process.env.STAGING_BASIC_AUTH_PASS??''
if(!BA_PASS){console.error('STAGING_BASIC_AUTH_PASS fehlt');process.exit(2)}
const BASIC='Basic '+Buffer.from(`${BA_USER}:${BA_PASS}`).toString('base64')
const OUT=join(ROOT,'docs/31.05.2026/2fa-google-audit'); mkdirSync(OUT,{recursive:true})

const browser=await chromium.launch()
const ctx=await browser.newContext({httpCredentials:{username:BA_USER,password:BA_PASS},locale:'de-DE'})
const page=await ctx.newPage()
const res={}
try{
  await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded',timeout:45000}); await page.waitForTimeout(700)
  await page.fill('input[name="email"], #email','test-admin@claimondo.de')
  await page.fill('input[name="password"], #password','Test1234!')
  await page.click('button:has-text("Einloggen")')
  await page.waitForURL((u)=>!u.pathname.startsWith('/login'),{timeout:60000})

  const fetch2fa=async(label)=>{
    const r=await ctx.request.get(`${BASE}/login/2fa`,{headers:{Authorization:BASIC},maxRedirects:0})
    const b=await r.text()
    return {label,status:r.status(),location:r.headers()['location']??null,
      title:(b.match(/<title>([^<]*)<\/title>/i)||[])[1]||null,
      hasTwoFa:/Zwei-Faktor/i.test(b), hasWeiterleitung:/Weiterleitung/i.test(b),
      appError:/Application error|client-side exception|something went wrong|Internal Server Error/i.test(b),
      errDigest:/digest["']?\s*[:=]|__next_error__|nextjs.*error/i.test(b),
      mentionsAdmin:(b.match(/\/admin/g)||[]).length, redirectMarker:/NEXT_REDIRECT/i.test(b),
      h1:(b.match(/<h1[^>]*>([\s\S]{0,80}?)<\/h1>/i)||[])[1]?.replace(/<[^>]+>/g,'').trim()||null,
      bodyLen:b.length}
  }
  res.withCookie=await fetch2fa('mit Cookie (frisch nach Login)')
  await ctx.clearCookies({name:'claimondo_2fa_verified'})
  res.withoutCookie=await fetch2fa('ohne Cookie')
  const adminNo=await ctx.request.get(`${BASE}/admin`,{headers:{Authorization:BASIC},maxRedirects:0})
  res.adminWithout={status:adminNo.status(),location:adminNo.headers()['location']??null}
}catch(e){res.error=String(e.message).slice(0,200)}
await browser.close()
writeFileSync(join(OUT,'render-classify.json'),JSON.stringify(res,null,2))
console.log(JSON.stringify(res,null,2))
