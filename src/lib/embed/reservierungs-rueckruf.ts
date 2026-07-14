import 'server-only'

// AAR-956 · Embed Gutachter-Finder · Reservierungs-Rueckruf — Upsert (server).
//
// Garantiert GENAU EINEN admin_termine (typ='rueckruf') pro Reservierung/Lead:
//   - Auto-Anlage aus reserviereEmbedTermin (vonKunde=false, ASAP)
//   - der Kunde stellt auf der Danke-Seite eine Wunschzeit ein (vonKunde=true)
//     -> aktualisiert DIESELBE Zeile (kein zweiter Rueckruf).
//
// Dedup app-seitig (kein Unique-Index — ein globaler auf admin_termine(lead_id)
// koennte Sibling-Flows wie erstelleOeffentlichenRueckruf brechen). Die PURE
// Spalten-Logik liegt in ./reservierungs-rueckruf-columns (vitest-getestet).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReservierungsRueckruf } from './reservierungs-rueckruf-columns'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'

export async function upsertReservierungsRueckruf(input: {
  leadId: string
  /** Start des Rueckrufs (UTC-ISO). Auto = ASAP (now+5min), Kunde = gewaehlte Wunschzeit. */
  startIso: string
  vonKunde: boolean
}): Promise<{ ok: boolean; terminId?: string; dispId?: string; error?: string }> {
  const { leadId, startIso, vonKunde } = input
  const admin = createAdminClient()

  // 1) Lead -> Name + zugewiesener Dispatcher.
  const { data: lead } = await admin
    .from('leads')
    .select('vorname, nachname, zugewiesen_an')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Lead nicht gefunden' }

  // 2) Dispatcher: der dem Lead zugewiesene; Fallback erster Dispatch-User.
  let dispId = (lead.zugewiesen_an as string | null) ?? null
  if (!dispId) {
    const { data: d } = await admin.from('profiles').select('id').eq('rolle', 'dispatch').limit(1).maybeSingle()
    dispId = (d?.id as string | null) ?? null
  }
  if (!dispId) return { ok: false, error: 'Kein Dispatcher verfuegbar' }

  const name =
    [((lead.vorname as string | null) ?? '').trim(), ((lead.nachname as string | null) ?? '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Kunde'

  const columns = buildReservierungsRueckruf({ leadId, dispId, name, startIso, vonKunde })

  // 3) Genau ein Rueckruf pro Lead: existierenden finden -> Update, sonst Insert.
  //    limit(1) schuetzt maybeSingle vor evtl. Alt-Duplikaten.
  const { data: existing } = await admin
    .from('admin_termine')
    .select('id')
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let terminId: string
  if (existing?.id) {
    // erstellt_von NICHT ueberschreiben (bleibt von der Auto-Anlage).
    const { titel, beschreibung, start_zeit, end_zeit, status, zugewiesen_an } = columns
    const { error } = await admin
      .from('admin_termine')
      .update({ titel, beschreibung, start_zeit, end_zeit, status, zugewiesen_an })
      .eq('id', existing.id as string)
    if (error) return { ok: false, error: error.message }
    terminId = existing.id as string
  } else {
    const { data, error } = await admin.from('admin_termine').insert(columns).select('id').single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Rueckruf konnte nicht angelegt werden' }
    terminId = data.id as string

    // ⚠ Aaron 15.07. — Glocke fuer den Dispatcher (fehlte bisher in BEIDEN Pfaden, die hier
    // reinlaufen: Teilschuld-Rueckruf aus dem /flow UND der Gutachter-Embed-Reservierungs-Rueckruf).
    // Ohne sie sah der Dispatcher den Rueckruf nur, wenn er aktiv /dispatch/rueckrufe oeffnete — keine
    // Benachrichtigung. NUR beim Insert (ein neuer Rueckruf); das Wunschzeit-Update des Kunden feuert
    // keine zweite Glocke. Non-critical: ein Mitteilungs-Fehler nimmt den Rueckruf nicht zurueck.
    try {
      await createMitteilung({
        empfaenger_id: dispId,
        empfaenger_rolle: 'admin', // Dispatch teilt die admin-Empfaenger-Rolle (wie public-rueckruf)
        kategorie: 'anruf', // CHECK: update|task|nachricht|anruf — ein Rueckruf ist ein anzurufender Kontakt
        titel: 'Neuer Rückruf angefordert',
        inhalt: name,
        kontext_typ: 'lead',
        kontext_id: leadId,
        route_url: `/dispatch/rueckrufe?open=${terminId}`,
      })
    } catch (err) {
      console.error('[upsertReservierungsRueckruf] Dispatcher-Mitteilung fehlgeschlagen (non-fatal):', err)
    }
  }

  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/dispatch/dashboard')
  return { ok: true, terminId, dispId }
}
