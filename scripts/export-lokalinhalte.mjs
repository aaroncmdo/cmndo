// Exportiert den VEROEFFENTLICHTEN Ist-Stand aus stadt_lokalinhalte als
// Chargendatei-Format (camelCase), damit eine Nachbesserung auf dem echten
// Bestand aufsetzt statt ihn abzutippen.
//
// WARUM: `import-lokalinhalte.mjs --ersetzen` ueberschreibt die Zeile
// VOLLSTAENDIG. Der Rueckschritt-Waechter dort vergleicht aber NUR die Anzahl
// der lokale_faqs — verlorene stadtbezirke, hauptachsen oder topografie_anker
// faellt er nicht. Wer die Datei von Hand nachbaut, verliert sie still.
//
// LAUF: node scripts/export-lokalinhalte.mjs <slug,slug,...> > datei.json

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const REPO = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2'

function env(schluessel) {
  const zeile = readFileSync(`${REPO}/.env.local`, 'utf8')
    .split('\n')
    .find((z) => z.startsWith(`${schluessel}=`))
  if (!zeile) throw new Error(`${schluessel} fehlt in .env.local`)
  return zeile.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
}

const slugs = (process.argv[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (slugs.length === 0) {
  console.error('Slugs fehlen. Beispiel: node scripts/export-lokalinhalte.mjs koeln,frechen')
  process.exit(1)
}

const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const { data, error } = await db
  .from('stadt_lokalinhalte')
  .select('stadt_slug, stadtbezirke, hauptachsen, unfall_hotspots, lokale_faqs, hero_anker, topografie_anker')
  .eq('status', 'veroeffentlicht')
  .in('stadt_slug', slugs)

if (error) {
  console.error(`Lesen fehlgeschlagen: ${error.message}`)
  process.exit(1)
}

// Reihenfolge der uebergebenen Slugs beibehalten — erleichtert das Diffen.
const nachSlug = new Map((data ?? []).map((z) => [z.stadt_slug, z]))
const raus = {}
for (const s of slugs) {
  const z = nachSlug.get(s)
  if (!z) {
    console.error(`⚠ ${s}: keine veroeffentlichte Zeile gefunden`)
    continue
  }
  raus[s] = {
    stadtbezirke: z.stadtbezirke ?? [],
    hauptachsen: z.hauptachsen ?? { autobahnen: [], bundesstrassen: [], knoten: [] },
    unfallHotspots: z.unfall_hotspots ?? [],
    lokaleFaqs: z.lokale_faqs ?? [],
    ...(z.hero_anker ? { heroAnker: z.hero_anker } : {}),
    ...(z.topografie_anker ? { topografieAnker: z.topografie_anker } : {}),
  }
}

console.log(JSON.stringify(raus, null, 2))
