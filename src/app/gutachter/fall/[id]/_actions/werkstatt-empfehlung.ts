'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { findWerkstattVorschlaegeFuer } from '@/lib/werkstatt/matching/lade-vorschlaege'
import { buildEmpfehlungRows } from '@/lib/werkstatt/empfehlung/build-rows'
import { notifyKundeWerkstattEmpfehlung } from '@/lib/werkstatt/notify-kunde-empfehlung'
import { revalidatePath } from 'next/cache'

const EMPFEHLUNG_TTL_MS = 14 * 24 * 3600e3 // 14 Tage

/**
 * Gutachter empfiehlt IM AUFTRAG des Kunden 1-3 Partner-Werkstaetten (Option 1:
 * empfehlen statt direkt zuweisen). Persistiert einen Empfehlungs-Batch + Magic-Link
 * und benachrichtigt den Kunden (WhatsApp + Email). Die Zuweisung selbst passiert erst,
 * wenn der Kunde auf /werkstatt-empfehlung/[token] eine Werkstatt waehlt.
 * Ownership: der Claim muss diesem SV zugewiesen sein (sv_id, CMM-49-Muster).
 */
export async function empfehleWerkstaettenAlsGutachter(
  input: { fallId: string; werkstattIds: string[] },
): Promise<{ ok: boolean; error?: string }> {
  if (input.werkstattIds.length < 1 || input.werkstattIds.length > 3)
    return { ok: false, error: 'Bitte 1 bis 3 Werkstätten auswählen.' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein Sachverständigen-Profil gefunden' }

  const claimId = await resolveClaimId(supabase, input.fallId)
  const { data: claim } = claimId
    ? await supabase
        .from('claims')
        .select('id')
        .eq('id', claimId)
        .eq('sv_id', (sv as { id: string }).id)
        .maybeSingle()
    : { data: null }
  if (!claim || !claimId) return { ok: false, error: 'Fall nicht gefunden oder kein Zugriff.' }

  // Server-autoritativer Snapshot: dieselbe Finder-Quelle wie die SV-Card (default limit),
  // damit die vom SV gewaehlten IDs deckungsgleich sind.
  const vorschlaege = await findWerkstattVorschlaegeFuer({ target: 'claim', id: claimId, nurEchte: true })
  const rows = buildEmpfehlungRows(vorschlaege, input.werkstattIds)
  if (rows.length === 0) return { ok: false, error: 'Keine gültige Werkstatt in der Auswahl.' }

  const admin = createAdminClient()

  // Nur EINE offene Empfehlung pro Fall. Sonst laegen zwei Magic-Links parallel und der
  // Kunde koennte auf dem alten Link eine Werkstatt waehlen, die der SV laengst ersetzt hat.
  // Der SV muss die laufende erst zurueckziehen (zieheWerkstattEmpfehlungZurueck).
  const { data: bereitsOffen } = await admin
    .from('werkstatt_empfehlung_batches')
    .select('id')
    .eq('claim_id', claimId)
    .eq('status', 'offen')
    .limit(1)
  if (bereitsOffen && (bereitsOffen as Array<{ id: string }>).length > 0)
    return { ok: false, error: 'Es läuft bereits eine Empfehlung. Bitte zuerst zurückziehen.' }

  const token = `wemp-${crypto.randomUUID()}`
  const { data: batch, error: bErr } = await admin
    .from('werkstatt_empfehlung_batches')
    .insert({
      claim_id: claimId,
      empfohlen_von: user.id,
      token,
      expires_at: new Date(Date.now() + EMPFEHLUNG_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (bErr || !batch) return { ok: false, error: bErr?.message ?? 'Empfehlung konnte nicht angelegt werden.' }

  const batchId = (batch as { id: string }).id
  const { error: rErr } = await admin
    .from('werkstatt_empfehlungen')
    .insert(rows.map((r) => ({ ...r, batch_id: batchId })))
  if (rErr) return { ok: false, error: rErr.message }

  // Kunde-Kontakt aufloesen (geschaedigter_user_id -> profiles, sonst lead -> leads).
  let kunde: { vorname: string | null; telefon: string | null; email: string | null } = {
    vorname: null,
    telefon: null,
    email: null,
  }
  const { data: cx } = await admin
    .from('claims')
    .select('geschaedigter_user_id, lead_id')
    .eq('id', claimId)
    .maybeSingle()
  const c = cx as { geschaedigter_user_id: string | null; lead_id: string | null } | null
  if (c?.geschaedigter_user_id) {
    const { data: p } = await admin
      .from('profiles')
      .select('vorname, telefon, email')
      .eq('id', c.geschaedigter_user_id)
      .maybeSingle()
    const pr = p as { vorname: string | null; telefon: string | null; email: string | null } | null
    if (pr) kunde = { vorname: pr.vorname, telefon: pr.telefon, email: pr.email }
  }
  if (!kunde.telefon && !kunde.email && c?.lead_id) {
    const { data: l } = await admin
      .from('leads')
      .select('vorname, telefon, email')
      .eq('id', c.lead_id)
      .maybeSingle()
    const lr = l as { vorname: string | null; telefon: string | null; email: string | null } | null
    if (lr) kunde = { vorname: kunde.vorname ?? lr.vorname, telefon: lr.telefon, email: lr.email }
  }

  // Non-critical: WhatsApp + Email mit dem Magic-Link. Send-Fehler nimmt die Empfehlung nicht zurueck.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
    await notifyKundeWerkstattEmpfehlung({
      kunde,
      link: `${appUrl}/werkstatt-empfehlung/${token}`,
      anzahl: rows.length,
      fallId: input.fallId,
    })
  } catch (err) {
    console.error('[werkstatt-empfehlung] notify fehlgeschlagen (non-fatal):', err)
  }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  return { ok: true }
}

/**
 * SV zieht eine LAUFENDE Empfehlung zurueck (Spec §11): Batch -> 'zurueckgezogen'.
 * Der Magic-Link ist damit tot — getWerkstattEmpfehlungByToken liefert dann
 * „Diese Empfehlung ist nicht mehr aktiv."; danach kann der SV neu empfehlen.
 * Ownership identisch zum Empfehlen (Claim muss diesem SV zugewiesen sein).
 *
 * Bereits ENTSCHIEDENE Batches bleiben bewusst unangetastet: dort ist
 * assignReparaturWerkstatt schon gelaufen (Kunde hat gewaehlt, Werkstatt ist informiert) —
 * das zurueckzunehmen waere ein Rueckbau der Zuweisung und gehoert nicht hierher.
 */
export async function zieheWerkstattEmpfehlungZurueck(
  input: { fallId: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein Sachverständigen-Profil gefunden' }

  const claimId = await resolveClaimId(supabase, input.fallId)
  const { data: claim } = claimId
    ? await supabase
        .from('claims')
        .select('id')
        .eq('id', claimId)
        .eq('sv_id', (sv as { id: string }).id)
        .maybeSingle()
    : { data: null }
  if (!claim || !claimId) return { ok: false, error: 'Fall nicht gefunden oder kein Zugriff.' }

  // Auf die zurueckgegebenen Rows (data) pruefen, NICHT auf count — count kann je nach
  // Content-Range-Header null sein und wuerde ein erfolgreiches Update als „nichts
  // geaendert" werten (gleiche Falle wie im Confirm der Kunde-Route).
  const admin = createAdminClient()
  const { error, data: zurueckgezogen } = await admin
    .from('werkstatt_empfehlung_batches')
    .update({ status: 'zurueckgezogen', updated_at: new Date().toISOString() })
    .eq('claim_id', claimId)
    .eq('status', 'offen')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!zurueckgezogen || (zurueckgezogen as Array<{ id: string }>).length === 0)
    return { ok: false, error: 'Keine laufende Empfehlung zum Zurückziehen.' }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  return { ok: true }
}
