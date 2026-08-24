'use server'

// Sub-Projekt 1 (Kunde-Portal 1+): In-Portal-Schadenmeldung.
// Blaupause: src/app/admin/faelle/anlegen/actions.ts (anlegeFall) — aber mit
// Kunde-Auth statt Admin-Guard und kunde_id = user.id, damit der eingeloggte
// Kunde als geschaedigter gesetzt wird (sonst findet getKundeFaelle den Fall nicht).
// Reine Feld-Logik in src/lib/kunde/schaden-melden.ts (golden-getestet).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
// C2a (Fundament, Ein Intake): der Wizard laeuft ueber createCase (dedup->lead->flowlink->convert).
import { createCase } from '@/lib/intake/create-case'
import { ensureVehicleForClaim } from '@/lib/vehicles/ensure-vehicle'
import { buildSchadenLeadInput, type SchadenMeldenForm } from '@/lib/kunde/schaden-melden'
import { notifyTeamNeuerLead } from '@/lib/leads/notify-team-lead'

export async function meldeNeuenSchaden(
  form: SchadenMeldenForm,
): Promise<{ ok: true; fallId: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['kunde'])
  const db = createAdminClient()

  // Kundendaten vorbefuellen (Name/Telefon/Sprache aus dem Profil, Email aus Auth).
  const { data: prof } = await db
    .from('profiles')
    .select('vorname, nachname, telefon, sprache')
    .eq('id', user.id)
    .maybeSingle()

  const built = buildSchadenLeadInput(form, {
    userId: user.id,
    vorname: (prof?.vorname as string | null) ?? null,
    nachname: (prof?.nachname as string | null) ?? null,
    telefon: (prof?.telefon as string | null) ?? null,
    email: user.email ?? null,
    sprache: (prof?.sprache as string | null) ?? null,
  })
  if (!built.ok) return { ok: false, error: built.error }

  // C2a: EIN createCase-Call ersetzt createLead + convertLeadToFall. Modus 'direct-claim' (Muster D
  // — sofort Claim). Garantien: Dedup (Doppel-Submit -> 1 Claim, schliesst P1 #3), Lead, FlowLink
  // (Kunde-Kanal), Konversion inkl. Pflichtdok/Kunde-WA/KB. Der Wrapper-Pfad (KB-Sticky, non-fatal
  // Sends) lebt unveraendert in convertLeadToFall, das createCase im direct-claim-Modus ruft.
  const result = await createCase(db, {
    mode: 'direct-claim',
    base: built.base,
    extra: built.extra,
    triggerByUserId: user.id,
    dedup: {
      telefon: built.base.telefon ?? null,
      email: built.base.email ?? null,
      kennzeichen: (built.extra.kennzeichen as string | null | undefined) ?? null,
    },
    flowLink: { sprache: (prof?.sprache as string | null) ?? null },
  })
  if (!result.ok) return { ok: false, error: result.error }
  const fallId = result.claimId ?? result.leadId

  // Team-WA (Audit 23.08.: dieser Eintrittspunkt war stumm — ein eingeloggter
  // Kunde meldete hier einen Schaden und niemand erfuhr davon). direct-claim ->
  // der Link zeigt auf die Fallakte, nicht auf den Lead.
  await notifyTeamNeuerLead({
    leadId: result.leadId,
    quelle: 'Kunde-Portal (Schaden melden)',
    name: [built.base.vorname, built.base.nachname].filter(Boolean).join(' '),
    telefon: built.base.telefon ?? null,
    email: built.base.email ?? null,
    zusatz: [built.extra.kennzeichen ? `🚗 ${built.extra.kennzeichen}` : null],
    linkPfad: `/faelle/${fallId}`,
  })

  // Fahrzeug ohne FIN -> Stub, setzt claims.vehicle_id. Non-critical (Fall steht bereits).
  if (built.extra.kennzeichen) {
    try {
      await ensureVehicleForClaim({ claimId: fallId, snapshot: { kennzeichen: built.extra.kennzeichen }, db })
    } catch (err) {
      console.error('[meldeNeuenSchaden] ensureVehicleForClaim:', err)
    }
  }

  revalidatePath('/kunde')
  return { ok: true, fallId }
}
