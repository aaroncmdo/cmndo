'use server'

// D2: Der Kunde korrigiert seine Unfallskizze.
//
// WARUM DER KUNDE: Die Skizze wird aus seinem Hergangstext automatisch erzeugt und wandert
// spaeter ins Gutachten und zur gegnerischen Versicherung. Er ist die einzige Instanz, die
// weiss, ob die Darstellung stimmt — und der Einzige, den eine falsche Darstellung Geld kostet.
//
// WARUM ALS TEXT UND NICHT GRAFISCH: Die Skizze IST die Darstellung seines Textes. Stimmt sie
// nicht, war entweder die Beschreibung ungenau oder das Modell hat sie falsch gelesen. Beides
// behebt eine Textkorrektur — ein SVG-Editor fuer Laien kurz nach einem Unfall nicht.
//
// Der urspruengliche `unfallhergang` bleibt UNANGETASTET: er ist die Aussage des Kunden zum
// Zeitpunkt der Meldung und damit beweisrelevant. Die Korrektur geht als Zusatz in den Prompt.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function meldeSkizzeKorrektur(
  claimId: string,
  korrektur: string,
): Promise<{ ok: boolean; error?: string }> {
  const text = korrektur.trim()
  if (!text) return { ok: false, error: 'Bitte beschreibe kurz, was nicht stimmt.' }
  if (text.length > 1000) return { ok: false, error: 'Bitte fasse dich etwas kuerzer (max. 1000 Zeichen).' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Eigentuemer-Gate ueber den RLS-Client: sieht er den Claim, gehoert er ihm. Der Kunde
  // darf `claims` nicht selbst schreiben — der Write laeuft danach ueber den Admin-Client.
  //
  // ⚠ `unfallhergang`/`schadentyp` liegen NICHT auf `claims` (16.08. gegen information_schema
  // geprueft, nicht geraten) — sie stehen auf dem LEAD. Der Claim liefert hier nur das Gate
  // und den Zeiger dorthin.
  const { data: claim } = await supabase
    .from('claims')
    .select('id, claim_nummer, lead_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Fall nicht gefunden' }

  const admin = createAdminClient()

  // 1. Die Meldung festhalten. `.select()` + Row-Check, damit ein stiller 0-Row-Write
  //    auffliegt statt Erfolg zu melden (Lehre aus dem DSGVO-Storno-Fehlschlag).
  const { data: geschrieben, error: schreibFehler } = await admin
    .from('claims')
    .update({ unfallskizze_bestaetigt: false, unfallskizze_ablehnung_grund: text })
    .eq('id', claimId)
    .select('id')
  if (schreibFehler) return { ok: false, error: schreibFehler.message }
  if (!geschrieben?.length) return { ok: false, error: 'Die Meldung konnte nicht gespeichert werden.' }

  // 2. Dispatch informieren. Bewusst NICHT ueber `createAdHocTask` — der Helper laesst
  //    (richtigerweise) nur KB/SV/Admin zu; ein Kunde soll keine beliebigen Tasks anlegen
  //    koennen. Hier ist der Task die Folge einer gepruefsten Eigentuemer-Aktion.
  try {
    await admin.from('tasks').insert({
      claim_id: claimId,
      typ: 'adhoc',
      titel: 'Kunde meldet: Unfallskizze stimmt nicht',
      beschreibung: `Korrektur des Kunden zu ${claim.claim_nummer ?? claimId}:\n\n${text}`,
      status: 'offen',
      empfaenger_rolle: 'dispatch',
      prioritaet: 'normal',
    })
  } catch (err) {
    // Non-critical: die Meldung steht bereits am Claim, Dispatch sieht sie dort.
    console.error('[skizze-korrektur] Task anlegen fehlgeschlagen:', err)
  }

  // 3. Neu generieren — mit Original-Hergang PLUS Korrektur. Fire-and-forget waere hier
  //    falsch: der Kunde hat gerade geklickt und erwartet ein Ergebnis; der Call dauert
  //    5-15 s und laeuft in seiner Wartezeit.
  //
  //    Ohne Lead gibt es keinen Hergangstext und damit nichts, woraus sich neu generieren
  //    liesse (die Skizze entsteht ausschliesslich aus Lead-Daten). Dann bleibt es bei
  //    Meldung + Dispatch-Aufgabe — der Mensch uebernimmt. Kein Fehler fuer den Kunden.
  const leadId = claim.lead_id as string | null
  try {
    if (!leadId) {
      console.warn('[skizze-korrektur] Claim ohne lead_id — keine Neugenerierung moeglich')
      revalidatePath(`/kunde/faelle/${claimId}`)
      return { ok: true }
    }
    const { data: lead } = await admin
      .from('leads')
      .select('unfallhergang, schadentyp, gegner_fahrzeugtyp')
      .eq('id', leadId)
      .maybeSingle()

    const { generateUnfallskizze } = await import('@/lib/unfallskizze/generate')
    const skizze = await generateUnfallskizze({
      unfallhergang: `${lead?.unfallhergang ?? ''}\n\nKorrektur des Kunden: ${text}`.trim(),
      schadentyp: (lead?.schadentyp as string | null) ?? null,
      gegnerFahrzeugtyp: (lead?.gegner_fahrzeugtyp as string | null) ?? null,
    })
    if (skizze.success) {
      await admin
        .from('claims')
        .update({
          unfallskizze_svg: skizze.svg,
          unfallskizze_generiert_am: new Date().toISOString(),
          // Der Grund bleibt STEHEN, anders als beim automatischen Erstlauf: Dispatch soll
          // sehen, worauf diese Fassung antwortet.
        })
        .eq('id', claimId)
    } else {
      console.warn('[skizze-korrektur] Neugenerierung fehlgeschlagen:', skizze.error)
    }
  } catch (err) {
    console.warn('[skizze-korrektur] Neugenerierung (non-critical):', err)
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
