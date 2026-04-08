/**
 * KFZ-148: Seed-Skript für Vertragsvorlagen.
 * Liest HTML-Dateien aus content/vertraege/ und legt Einträge in vertragsvorlagen an.
 * Ausführen: npx tsx scripts/kfz148_seed_vertraege.ts
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { readFileSync } from 'fs'
import { join } from 'path'

async function seed() {
  const db = createAdminClient()

  const vorlagen = [
    {
      typ: 'nutzungsbedingungen',
      version: 'v1.0',
      titel: 'Nutzungsbedingungen Gutachterportal Claimondo',
      file: 'nutzungsbedingungen_v1.html',
      pflicht_unterschrift: true,
    },
    {
      typ: 'kooperationsvertrag_muster',
      version: 'v1.0',
      titel: 'Kooperationsvertrag KFZ-Sachverständigenpartnerschaft (Muster)',
      file: 'kooperationsvertrag_muster_v1.html',
      pflicht_unterschrift: false,
    },
  ]

  for (const v of vorlagen) {
    const filePath = join(process.cwd(), 'content', 'vertraege', v.file)
    let inhalt = ''
    try {
      inhalt = readFileSync(filePath, 'utf-8')
    } catch {
      console.error(`  [WARN] ${v.file} nicht gefunden — Platzhalter wird verwendet`)
      inhalt = `<p>TODO: ${v.titel} — Text noch nicht eingefügt.</p>`
    }

    const { error } = await db.from('vertragsvorlagen').upsert({
      typ: v.typ,
      version: v.version,
      titel: v.titel,
      inhalt_html: inhalt,
      pflicht_unterschrift: v.pflicht_unterschrift,
      aktiv: true,
    }, { onConflict: 'typ,version' })

    if (error) {
      // Fallback: Insert (upsert on typ+version may not work if no unique constraint)
      const { error: insertErr } = await db.from('vertragsvorlagen').insert({
        typ: v.typ,
        version: v.version,
        titel: v.titel,
        inhalt_html: inhalt,
        pflicht_unterschrift: v.pflicht_unterschrift,
        aktiv: true,
      })
      if (insertErr) console.error(`  [FAIL] ${v.typ}: ${insertErr.message}`)
      else console.log(`  [OK] ${v.typ} v${v.version} (insert)`)
    } else {
      console.log(`  [OK] ${v.typ} v${v.version}`)
    }
  }

  console.log('Seed abgeschlossen.')
}

seed()
