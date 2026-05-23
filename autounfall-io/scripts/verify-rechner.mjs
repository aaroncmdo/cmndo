#!/usr/bin/env node
/* WP-4 Logik-Verifikation. Re-implementiert die Rechner-Formeln VERBATIM aus den
 * Prototyp-Quellen (au-rechner.js · sf-rueckstufungs-rechner-widget.js · Wizard ·
 * kuerzungs-checker) und gibt fuer feste Test-Inputs die Ergebnisse aus. Diese
 * Werte sind die Soll-Werte, gegen die der TS-Port (components/tools/*) geprueft
 * wird — die Strings/Formeln im Port sind 1:1 dieselben. */

// ── au-rechner.js (verbatim) ─────────────────────────────────────────────────
const NUTZ = { A:[23,27],B:[29,35],C:[38,43],D:[50,59],E:[59,65],F:[65,79],G:[79,99],H:[99,119],J:[119,139],K:[139,175],L:[175,219] }
const SCHMERZ = {'HWS Grad 1 (leicht)':[250,800],'HWS Grad 2 (Beschwerden, AU 1-4 Wo)':[800,2000],'HWS Grad 3 (Befund, längere AU)':[2000,5000],'Prellung/Quetschung (folgenlos)':[250,1500],'Knochenbruch Finger/Zehen':[500,2000],'Rippenbruch (folgenlos)':[1500,4000],'Handgelenksfraktur':[2000,6000],'Schlüsselbeinbruch':[1500,5000],'Kreuzbandriss':[5000,15000],'Schnittwunde mit Narbe':[1500,5000]}
const BS = {0:100,1:70,5:50,10:38,15:32,20:28,25:26,30:24,35:22}
function bsOf(sf){var k=Object.keys(BS).map(Number).sort(function(a,b){return a-b;});var lo=k[0];for(var i=0;i<k.length;i++){if(k[i]<=sf)lo=k[i];}var hi=k.find(function(x){return x>=sf;});if(hi==null)hi=k[k.length-1];if(lo===hi)return BS[lo];return BS[lo]+(BS[hi]-BS[lo])*((sf-lo)/(hi-lo));}
const RUECK = {35:23,30:19,25:16,20:12,15:7,10:4,7:2,5:1,3:0,1:0}
function rueckOf(sf){var k=Object.keys(RUECK).map(Number);var best=k[0];for(var i=0;i<k.length;i++){if(Math.abs(k[i]-sf)<Math.abs(best-sf))best=k[i];}return RUECK[best];}
function eur(n){ return Math.round(n).toLocaleString('de-DE') }

function calcNutz(kv, tv){ const r=NUTZ[kv]; return `Geschätzt: ${eur(r[0]*tv)}–${eur(r[1]*tv)} € (${r[0]}–${r[1]} €/Tag × ${tv} Tage)` }
function calcSchmerz(v){ const r=SCHMERZ[v]; return `Größenordnung: ${eur(r[0])}–${eur(r[1])} €` }
function calcSf6(s,b,sch){ const sn=rueckOf(s); const bn=b*(bsOf(sn)/bsOf(s)); const j=Math.max(1,s-sn); const d=bn-b; const lo=Math.round(d*j*0.5/10)*10; const hi=Math.round(d*j/10)*10; const rec=sch<lo?'selbst zahlen':(sch>hi*1.2?'Versicherung nutzen':'Grenzfall'); return `SF ${s}→${sn}, ~${j} J., Mehrbeitrag ${eur(lo)}–${eur(hi)} € → ${rec}` }
function calcTotal(W,R0,P){ if(P<=W)return 'Reparatur'; if(P<=1.3*W)return '130-%-Regel'; return `Totalschaden, Ersatz=${eur(W-(R0||0))} €` }
function calcWm(W,P,A,K){ const rel=(A<=5)&&(K<=100000)&&(P>=0.1*W); if(!rel)return 'eher nicht relevant'; const lo=Math.round(P*0.05/50)*50,hi=Math.round(P*0.15/50)*50; return `relevant: ${eur(lo)}–${eur(hi)} €` }
function calcVz(F,T,B){ const satz=(isNaN(B)?3.37:B)+5; const z=F*(satz/100)*(T/365); return `${satz.toFixed(2).replace('.',',')} % p.a. · ${eur(z)} € (auf ${T} Tage)` }

// ── Wizard-Varianten (verbatim) ──────────────────────────────────────────────
function wizSf(sf,be,sch){ const sfNeu=rueckOf(sf); const beNeu=be*(bsOf(sfNeu)/bsOf(sf)); const jahre=Math.max(1,sf-sfNeu); const diff=beNeu-be; const lo=Math.round(diff*jahre*0.5/10)*10,hi=Math.round(diff*jahre/10)*10; const rec=sch<lo?'selbst zahlen':(sch>hi*1.2?'Versicherung nutzen':'Grenzfall'); return `SF ${sf}→${sfNeu}, ~${jahre} J., Mehrbeitrag ${lo}–${hi} € → ${rec}` }
function wizNutz(k,t){ const r=NUTZ[k]; return `Nutzungsausfall ${r[0]*t}–${r[1]*t} €` }
function wizSchmerz(v){ const r=SCHMERZ[v]; return `${r[0].toLocaleString('de')}–${r[1].toLocaleString('de')} €` }

// ── SF-Widget (verbatim, vereinfacht auf Kern) ───────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dir = dirname(fileURLToPath(import.meta.url))
// sf-versicherer.json liegt in der gitignored Quelle; wir lesen die Werte aus
// dem TS-Port als Single-Source (Regex-Extract, da node kein TS importiert).
const sfSrc = readFileSync(join(__dir, '..', 'lib', 'tools', 'sf-versicherer.ts'), 'utf8')
function providerBlock(id){ const re = new RegExp(`['\"]?${id.replace('-','\\-')}['\"]?:\\s*\\{`); const m = re.exec(sfSrc); if(!m) throw new Error('provider not found: '+id); return sfSrc.slice(m.index) }
function sfTableOf(id){ const blk=providerBlock(id); const t=blk.slice(blk.indexOf('sfTable:')); const arr=t.slice(t.indexOf('['), t.indexOf(']')+1); const rows=[...arr.matchAll(/\{\s*id:\s*'([^']+)',\s*rate:\s*(\d+)\s*\}/g)]; return rows.map(r=>({id:r[1],rate:+r[2]})) }
function rueck1Of(id, sfId){ const blk=providerBlock(id); const t=blk.slice(blk.indexOf('rueckstufung1Schaden:')); const obj=t.slice(t.indexOf('{'), t.indexOf('}')+1); const re=new RegExp(`'${sfId.replace('.','\\.')}':\\s*'([^']+)'`); const m=re.exec(obj); return m?m[1]:null }
function sfWidget(id, sfId, schaden){ const tbl=sfTableOf(id); const oldRate=tbl.find(e=>e.id===sfId).rate; const newSfId=rueck1Of(id,sfId); const newRate=tbl.find(e=>e.id===newSfId).rate; let years=0,cur=newSfId,guard=40; while(cur!==sfId&&guard-->0){const idx=tbl.findIndex(e=>e.id===cur); if(idx<0||idx>=tbl.length-1)break; cur=tbl[idx+1].id; years++;} const base=800; const mean=(newRate+oldRate)/2/100; const total=Math.max(0,Math.round(base*(mean-oldRate/100)*years)); const rec=schaden<total?'selbst-zahlen':(schaden>total*1.5?'melden':'rabattschutz-pruefen'); return `SF ${sfId}(${oldRate}%)→${newSfId}(${newRate}%), ${years} J., Mehrkosten ${total} € → ${rec}` }

// ── Kürzungs-Checker totalLoss (verbatim) ────────────────────────────────────
const POS = { verbringung:130, upe:280, wertminderung:800, nutzungsausfall:500, 'sv-kosten':900, mietwagen:400 }
function totalLoss(ids){ return ids.reduce((s,id)=>s+(POS[id]||0),0) }

const cases = [
  ['Rechner.nutzungsausfall  (D, 14)', calcNutz('D',14)],
  ['Rechner.nutzungsausfall  (L, 10)', calcNutz('L',10)],
  ['Rechner.schmerzensgeld   (Kreuzbandriss)', calcSchmerz('Kreuzbandriss')],
  ['Rechner.schmerzensgeld   (HWS Grad 1)', calcSchmerz('HWS Grad 1 (leicht)')],
  ['Rechner.sf               (20, 320, 700)', calcSf6(20,320,700)],
  ['Rechner.sf               (5, 400, 200)', calcSf6(5,400,200)],
  ['Rechner.totalschaden     (12000,4000,14000)', calcTotal(12000,4000,14000)],
  ['Rechner.totalschaden     (10000,3000,20000)', calcTotal(10000,3000,20000)],
  ['Rechner.wertminderung    (15000,4000,3,60000)', calcWm(15000,4000,3,60000)],
  ['Rechner.wertminderung    (20000,1000,8,120000)', calcWm(20000,1000,8,120000)],
  ['Rechner.verzugszinsen    (5000,60,3.37)', calcVz(5000,60,3.37)],
  ['Rechner.verzugszinsen    (10000,90,3.37)', calcVz(10000,90,3.37)],
  ['Wizard.sf                (20,320,700)', wizSf(20,320,700)],
  ['Wizard.nutzungsausfall   (D,14)', wizNutz('D',14)],
  ['Wizard.schmerzensgeld    (Kreuzbandriss)', wizSchmerz('Kreuzbandriss')],
  ['SfRechner huk-coburg     (SF20, 2500€)', sfWidget('huk-coburg','20',2500)],
  ['SfRechner allianz        (SF0.5, 300€)', sfWidget('allianz','0.5',300)],
  ['SfRechner axa            (SF50, 5000€)', sfWidget('axa','50',5000)],
  ['KuerzungsChecker total   ([verbringung,nutzungsausfall])', `${totalLoss(['verbringung','nutzungsausfall']).toLocaleString('de-DE')} €`],
  ['KuerzungsChecker total   ([wertminderung,sv-kosten,mietwagen])', `${totalLoss(['wertminderung','sv-kosten','mietwagen']).toLocaleString('de-DE')} €`],
]

console.log('WP-4 Rechner-Verifikation (Soll-Werte aus Vorlage-Logik)\n')
for (const [label, out] of cases) console.log(`  ${label.padEnd(46)} → ${out}`)
console.log(`\n${cases.length} Testfälle berechnet.`)
