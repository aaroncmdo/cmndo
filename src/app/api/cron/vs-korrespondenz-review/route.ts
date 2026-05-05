import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'

export const dynamic = 'force-dynamic'

/**
 * CMM-43: 7-Tage-Review-Cron für VS-Korrespondenz-Stille.
 *
 * Laeuft 1x/Woche (vercel.json: Mo 09:00).
 *
 * Logik: alle Faelle in den VS-Phasen durchgehen. Wenn der juengste Eintrag
 * in vs_korrespondenz fuer den zugehoerigen claim_id aelter als 7 Tage ist
 * — oder gar keiner existiert — bekommt der KB eine Mitteilung „Bitte
 * Stand bei VS anfragen". Bei abgelaufener naechste_frist (CMM-42 Spalte)
 * wird die Mitteilung als prioritaer markiert.
 *
 * Idempotenz: pro Fall wird nur einmal pro 7-Tage-Fenster eskaliert. Wir
 * pruefen die timeline auf einen Eintrag typ='vs_korrespondenz_review'
 * jueger als 6 Tage — wenn vorhanden, skip.
 */

const VS_PHASEN = ['regulierung-laeuft', 'anschlussschreiben', 'vs-kuerzt', 'nachbesichtigung-laeuft']
const STILLE_TAGE_THRESHOLD = 7
const IDEMPOTENZ_TAGE = 6

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = Date.now()
  const stilleCutoff = new Date(now - STILLE_TAGE_THRESHOLD * 24 * 60 * 60 * 1000)
  const idempotenzCutoff = new Date(now - IDEMPOTENZ_TAGE * 24 * 60 * 60 * 1000)

  const { data: faelle, error: faelleErr } = await db
    .from('faelle')
    .select('id, fall_nummer, claim_id, kundenbetreuer_id')
    .in('status', VS_PHASEN)
    .not('kundenbetreuer_id', 'is', null)
    .not('claim_id', 'is', null)

  if (faelleErr) {
    console.error('[vs-korrespondenz-review] faelle query:', faelleErr.message)
    return NextResponse.json({ error: faelleErr.message }, { status: 500 })
  }

  if (!faelle?.length) {
    return NextResponse.json({ checked: 0, eskaliert: 0 })
  }

  let eskaliert = 0
  let geskippt = 0

  for (const fall of faelle) {
    const fallId = fall.id as string
    const claimId = fall.claim_id as string
    const kbId = fall.kundenbetreuer_id as string
    const fallNummer = (fall.fall_nummer as string | null) ?? fallId.slice(0, 8)

    // Idempotenz: gibt es schon einen Review-Eintrag in den letzten 6 Tagen?
    const { count: bereitsEskaliert } = await db
      .from('timeline')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fallId)
      .eq('typ', 'vs_korrespondenz_review')
      .gte('created_at', idempotenzCutoff.toISOString())

    if (bereitsEskaliert && bereitsEskaliert > 0) {
      geskippt++
      continue
    }

    // Juengsten vs_korrespondenz-Eintrag fuer den Claim laden
    const { data: juengster } = await db
      .from('vs_korrespondenz')
      .select('datum, naechste_frist')
      .eq('claim_id', claimId)
      .order('datum', { ascending: false })
      .limit(1)
      .maybeSingle()

    const letzterKontakt = juengster?.datum ? new Date(juengster.datum as string) : null
    const naechsteFrist = juengster?.naechste_frist ? new Date(juengster.naechste_frist as string) : null

    const noKontakt = letzterKontakt == null
    const tooOld = letzterKontakt != null && letzterKontakt.getTime() < stilleCutoff.getTime()
    const fristAbgelaufen = naechsteFrist != null && naechsteFrist.getTime() < now

    if (!noKontakt && !tooOld && !fristAbgelaufen) continue

    // Mitteilung bauen
    const tageSeitKontakt = letzterKontakt
      ? Math.floor((now - letzterKontakt.getTime()) / (1000 * 60 * 60 * 24))
      : null

    let inhalt: string
    if (noKontakt) {
      inhalt = `Fall ${fallNummer}: Noch kein VS-Kontakt erfasst. Bitte Stand bei der Versicherung anfragen.`
    } else if (fristAbgelaufen) {
      inhalt = `Fall ${fallNummer}: Versicherung hatte zugesagte Frist überschritten. Letzter Kontakt vor ${tageSeitKontakt} Tagen — bitte nachhaken.`
    } else {
      inhalt = `Fall ${fallNummer}: Letzter VS-Kontakt vor ${tageSeitKontakt} Tagen. Bitte Stand bei der Versicherung anfragen.`
    }

    const created = await createMitteilung({
      empfaenger_id: kbId,
      empfaenger_rolle: 'kundenbetreuer',
      kategorie: 'task',
      titel: 'VS-Stand anfragen',
      inhalt,
      kontext_typ: 'fall',
      kontext_id: fallId,
      prioritaet: fristAbgelaufen ? 'hoch' : 'normal',
    })

    if (!created) {
      console.error(`[vs-korrespondenz-review] createMitteilung fehlgeschlagen fuer Fall ${fallId}`)
      continue
    }

    // Idempotenz-Marker via timeline-Eintrag
    const { error: timelineErr } = await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'vs_korrespondenz_review',
      titel: 'VS-Stand-Reminder an KB gesendet',
      beschreibung: inhalt,
      erstellt_von: null,
    })

    if (timelineErr) {
      console.error(`[vs-korrespondenz-review] Timeline-Marker fehlgeschlagen fuer Fall ${fallId}:`, timelineErr.message)
    }

    eskaliert++
  }

  console.log(`[CMM-43] vs-korrespondenz-review: ${faelle.length} geprueft, ${eskaliert} eskaliert, ${geskippt} geskippt (idempotent)`)

  return NextResponse.json({
    checked: faelle.length,
    eskaliert,
    geskippt,
  })
}
