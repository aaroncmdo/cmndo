/** Verify-Helper: injiziert/loescht ein ZUKUENFTIGES Test-Event in
 *  sv_kalender_events_cache fuer test-sv, um die UI-Render-Logik zu pruefen.
 *  source='google' -> der Cron (der nur fuer google_refresh_token-SVs google-
 *  Rows prunet; test-sv hat keinen Token) laesst es in Ruhe.
 *    node scripts/probe-ui-cache-event.mjs insert|delete
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const SV_ID='1da11741-a406-45ce-a27b-c041576cccbb' // test-sv@claimondo.de sachverstaendige.id
const EXT_ID='ui-verify-future-test'
const mode=process.argv[2]
if(mode==='insert'){
  const now=new Date()
  const start=new Date(now.getTime()+24*3600*1000); start.setHours(10,0,0,0) // morgen 10:00
  const end=new Date(start.getTime()+60*60*1000)
  const { error }=await supa.from('sv_kalender_events_cache').upsert({
    sv_id:SV_ID, source:'google', external_event_id:EXT_ID,
    start_zeit:start.toISOString(), end_zeit:end.toISOString(), titel:'UI-Verify-Test',
    last_synced_at:new Date().toISOString(),
  },{onConflict:'sv_id,source,external_event_id'})
  console.log(JSON.stringify({ok:!error, error:error?.message, start:start.toISOString()}))
}else if(mode==='delete'){
  const { error }=await supa.from('sv_kalender_events_cache').delete().eq('sv_id',SV_ID).eq('external_event_id',EXT_ID)
  console.log(JSON.stringify({ok:!error, error:error?.message}))
}else{ console.error('insert|delete'); process.exit(2) }
