// CMM-50 (SP-E vehicles) Grounding-Probe — read-only via PostgREST. cwd = Haupt-Repo (.env.local).
//   node ".claude/worktrees/cmm44-phase-41-light-views/scripts/probe-cmm50-vehicles.mjs"
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
function env(k){ const r=readFileSync(resolve(process.cwd(),'.env.local'),'utf8'); return r.match(new RegExp('^'+k+'=(.+)$','m'))?.[1]?.trim().replace(/^["']|["']$/g,'') }
const URL = env('NEXT_PUBLIC_SUPABASE_URL')||'https://paizkjajbuxxksdoycev.supabase.co'
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
if(!KEY){console.error('SERVICE_ROLE_KEY fehlt');process.exit(1)}
const H={apikey:KEY,Authorization:`Bearer ${KEY}`}

async function cols(tbl){
  const res=await fetch(`${URL}/rest/v1/`,{headers:H}); const spec=await res.json()
  const defs=spec.definitions||spec.components?.schemas||{}; const d=defs[tbl]
  if(!d) return null
  return Object.fromEntries(Object.entries(d.properties||{}).map(([n,p])=>[n,(p.format||p.type)]))
}
async function count(tbl,filter=''){
  const r=await fetch(`${URL}/rest/v1/${tbl}?select=id${filter?'&'+filter:''}`,{headers:{...H,Prefer:'count=exact',Range:'0-0'}})
  const cr=r.headers.get('content-range'); return cr?cr.split('/')[1]:'HTTP '+r.status
}
async function main(){
  const v=await cols('vehicles'); const f=await cols('faelle'); const cvi=await cols('claim_vehicle_involvements'); const c=await cols('claims')
  console.log('=== vehicles ('+(v?Object.keys(v).length:'FEHLT')+' Spalten) ===')
  if(v) console.log(Object.keys(v).join(', '))
  console.log('\n=== claim_vehicle_involvements ('+(cvi?Object.keys(cvi).length:'FEHLT')+') ===')
  if(cvi) console.log(Object.keys(cvi).join(', '))

  // faelle Fahrzeug-Spec-Domaene
  const FZ=['vehicle_id','kennzeichen','kennzeichen_stadt','kennzeichen_buchstaben','kennzeichen_zahlen','fahrzeug_hersteller','fahrzeug_modell','fahrzeug_typ','fahrzeug_baujahr','fahrzeug_farbe','fahrzeug_ausstattung','fin_vin','fin_quelle','fin_extrahiert_am','hsn','tsn','erstzulassung','kilometerstand','lackfarbe_code','leasinggeber_name','ist_fahrzeughalter','firma_name','ust_id','bank_name']
  console.log('\n=== faelle Fahrzeug-Spec-Spalten (existiert?) ===')
  for(const col of FZ){ console.log(`   ${f&&col in f?'JA ':'NEIN'}  ${col}${f&&col in f?' ('+f[col]+')':''}`) }

  console.log('\n=== vehicle_id-Verknuepfung ===')
  console.log('   claims.vehicle_id:', c&&'vehicle_id' in c?'JA ('+c.vehicle_id+')':'NEIN')
  console.log('   faelle.vehicle_id:', f&&'vehicle_id' in f?'JA ('+f.vehicle_id+')':'NEIN')

  console.log('\n=== INTEGRITAETS-LUECKE (vehicle_id gesetzt?) ===')
  console.log('   vehicles total:', await count('vehicles'))
  console.log('   faelle total:', await count('faelle'))
  console.log('   faelle vehicle_id IS NULL:', await count('faelle','vehicle_id=is.null'))
  console.log('   claims total:', await count('claims'))
  console.log('   claims vehicle_id IS NULL:', await count('claims','vehicle_id=is.null'))
  console.log('   claim_vehicle_involvements total:', cvi?await count('claim_vehicle_involvements'):'(Tabelle fehlt)')

  // Welche fahrzeug-Spalten auf faelle sind tatsaechlich befuellt (Migrations-Rest)?
  console.log('\n=== faelle fahrzeug-Spalten befuellt (non-null count) ===')
  for(const col of ['fahrzeug_hersteller','fin_vin','hsn','kennzeichen','erstzulassung','kilometerstand','lackfarbe_code']){
    if(f&&col in f) console.log(`   ${col} non-null:`, await count('faelle',`${col}=not.is.null`))
  }
}
main().catch(e=>{console.error(e);process.exit(2)})
