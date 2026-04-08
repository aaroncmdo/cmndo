/**
 * KFZ-149: Seed 33 Lead-Preis-Einträge (exakt aus Aaron's Anhang).
 * Ausführen: npx tsx scripts/kfz149_seed_leadpreise.ts
 */
import { createAdminClient } from '../src/lib/supabase/admin'

// 33 Zeilen, 1:1 aus dem Vertragsanhang
const PREISE: [number, number, number][] = [
  [500, 200, 200], [750, 200, 200], [1000, 200, 200], [1250, 200, 200],
  [1500, 200, 200], [1750, 200, 200], [2000, 200, 200], [2500, 200, 200],
  [3000, 200, 200], [3500, 200, 200], [4000, 200, 212], [4500, 200, 224],
  [5000, 200, 236], [5500, 206, 248], [6000, 216, 259], [7000, 230, 276],
  [7500, 237, 284], [8000, 245, 294], [9000, 261, 313], [10000, 277, 332],
  [11000, 292, 350], [12000, 309, 370], [13000, 325, 390], [14000, 341, 409],
  [15000, 358, 429], [17500, 392, 470], [20000, 430, 516], [25000, 500, 599],
  [30000, 577, 692], [35000, 646, 776], [40000, 721, 865], [45000, 823, 987],
  [50000, 901, 1081],
]

async function seed() {
  const db = createAdminClient()
  console.log(`Seede ${PREISE.length} Lead-Preis-Einträge...`)

  for (const [grenze, paket, einzel] of PREISE) {
    const { error } = await db.from('leadpreise_tabelle').insert({
      schadenhoehe_bis_netto: grenze,
      paketpreis_netto: paket,
      einzelpreis_netto: einzel,
      version: 'v1',
      aktiv: true,
    })
    if (error) {
      console.error(`  [FAIL] ${grenze}: ${error.message}`)
    } else {
      console.log(`  [OK] ${grenze} → Paket: ${paket}, Einzel: ${einzel}`)
    }
  }

  // Verifizierung: Zählen
  const { count } = await db.from('leadpreise_tabelle').select('id', { count: 'exact', head: true }).eq('aktiv', true)
  console.log(`\nVerifizierung: ${count} aktive Einträge (erwartet: 33)`)
  if (count !== 33) console.error('WARNUNG: Erwartete 33 Einträge!')
}

seed()
