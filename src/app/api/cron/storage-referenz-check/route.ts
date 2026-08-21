// Waechter: prueft JEDE Datei-Referenz der Datenbank gegen den Storage.
//
// ANLASS (21.08.2026): 6 von 18 Pflichtdokumenten zeigten auf geloeschte Dateien — zwei SVs
// galten als `verifiziert`, hinter dem Vermerk lag nichts. Drei Monate unbemerkt, weil nichts
// danach schaut. Dazu 5 unterzeichnete Nutzungsbedingungen-PDFs und 5 Gegner-Unterschriften.
//
// ⭐ Der Waechter prueft den SOLL-Zustand (Datei da?), nicht den Prozess-Zustand (Upload
// gemeldet?) — genau die Unterscheidung, an der die Luecke drei Monate vorbeilief.
//
// Auth: Bearer CRON_SECRET. Aufruf per VPS-crontab (cron-call.sh).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { REFERENZ_QUELLEN, aufloesen, type ToteReferenz } from '@/lib/storage/referenz-check'

export const dynamic = 'force-dynamic'

const TASK_CODE = 'storage-referenz-tot'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const tot: ToteReferenz[] = []
  const signierte: string[] = []
  let geprueft = 0
  let extern = 0

  for (const q of REFERENZ_QUELLEN) {
    const felder = `${q.kontext},${q.spalte}`
    const { data: zeilen, error } = await db
      .from(q.tabelle)
      .select(felder)
      .not(q.spalte, 'is', null)
      .limit(2000)
    if (error) {
      console.error(`[storage-referenz] ${q.tabelle}.${q.spalte}: ${error.message}`)
      continue
    }

    for (const z of (zeilen ?? []) as unknown as Array<Record<string, unknown>>) {
      const wert = String(z[q.spalte] ?? '')
      if (!wert) continue
      const auf = aufloesen(wert, q.bucket)
      if (auf.art !== 'storage') {
        if (auf.art === 'extern') extern++
        continue
      }
      if (auf.signiert) signierte.push(`${q.tabelle}.${q.spalte}`)

      geprueft++
      // createSignedUrl ist der guenstigste Existenz-Test ueber den JS-Client: er schlaegt
      // fehl, wenn das Objekt fehlt, laedt die Datei aber NICHT herunter.
      const { error: sErr } = await db.storage.from(auf.bucket).createSignedUrl(auf.pfad, 60)
      if (sErr) {
        tot.push({
          tabelle: q.tabelle,
          spalte: q.spalte,
          bucket: auf.bucket,
          pfad: auf.pfad,
          kontext: q.kontext.split(',').map((k) => `${k}=${z[k] ?? '—'}`).join(' '),
          http: 404,
        })
      }
    }
  }

  // Task nur anlegen, wenn es Funde gibt UND nicht schon ein offener Task dazu existiert —
  // sonst waechst pro Nacht ein Duplikat und die Aufgabenliste verliert ihre Aussagekraft
  // (dieselbe Falle wie beim Smoke-Residue, das die Dispatch-Liste geflutet hat).
  let taskAngelegt = false
  if (tot.length > 0) {
    const { data: offen } = await db
      .from('tasks')
      .select('id')
      .eq('task_code', TASK_CODE)
      .neq('status', 'erledigt')
      .limit(1)
      .maybeSingle()

    if (!offen) {
      const liste = tot.slice(0, 10).map((t) => `• ${t.tabelle}.${t.spalte} — ${t.kontext}`).join('\n')
      try {
        // Bewusst OHNE entity_type: der Befund haengt an keiner einzelnen Entitaet
        // (TaskEntityType kennt kein 'system'). Adressiert wird stattdessen die Rolle,
        // damit der Task einen Verantwortlichen bekommt statt in einem Pool zu landen.
        await createLinkedTask({
          task_code: TASK_CODE,
          titel: `${tot.length} Datei-Referenz(en) zeigen ins Leere`,
          beschreibung:
            `Die Datenbank verweist auf ${tot.length} Datei(en), die im Storage nicht existieren. ` +
            `Betroffene Zeilen behaupten einen Nachweis, den niemand vorlegen kann.\n\n${liste}` +
            (tot.length > 10 ? `\n… und ${tot.length - 10} weitere` : ''),
          prioritaet: 'dringend',
          empfaenger_rolle: 'admin',
          auto_erstellt: true,
        })
        taskAngelegt = true
      } catch (err) {
        console.error('[storage-referenz] Task-Anlage fehlgeschlagen:', err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    geprueft,
    tot: tot.length,
    extern,
    signierte_urls: signierte.length,
    task_angelegt: taskAngelegt,
    treffer: tot.slice(0, 25),
  })
}
