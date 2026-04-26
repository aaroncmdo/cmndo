'use server'

// AAR-841: Kanzlei-Workflow Server-Actions
//
// 3 Actions:
//   setKanzleiWunsch      — Onboarding-Antwort speichern, ggf. auto-Paket triggern
//   sendKanzleiPaket      — Paket zusammenstellen + via Email/Portal versenden
//   resendKanzleiPaket    — bei Versand-Fehler nochmal versuchen
//
// Auto-Paket-Logik in setKanzleiWunsch: nur wenn claim.phase >= 4_gutachten_fertig.
// Bei eigene_kanzlei wird zusätzlich markClaimAsAnExterneKanzlei aus AAR-840
// aufgerufen → Endzustand für uns.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'
import { emitEvent } from '@/lib/notifications/emit'
import { markClaimAsAnExterneKanzlei } from '@/lib/claims/endzustand-actions'
import { getPartnerKanzleiSettings } from './queries'

type ActionResult = { ok: true; data?: Record<string, unknown> } | { ok: false; error: string }

export type KanzleiWunsch = 'partnerkanzlei' | 'eigene_kanzlei' | 'keine_kanzlei' | 'noch_unentschieden'
export type EmpfaengerTyp  = 'partnerkanzlei' | 'eigene_kanzlei'

type EigeneKanzleiInput = {
  name: string
  email?: string
  telefon?: string
  kontaktperson?: string
}

const PHASEN_AB_4 = new Set(['4_gutachten_fertig', '5_in_reparatur', '6_kommunikation_versicherung'])

async function loadClaimContext(claimId: string): Promise<
  | { ok: true; fallId: string; phase: string | null; status: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient()
  const { data: claim, error } = await admin
    .from('claims')
    .select('id, status, phase')
    .eq('id', claimId)
    .maybeSingle()
  if (error || !claim) return { ok: false, error: 'Claim nicht gefunden' }

  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'Kein Fall für diesen Claim' }

  return {
    ok: true,
    fallId: fall.id as string,
    phase:  (claim.phase as string | null) ?? null,
    status: claim.status as string,
  }
}

// ── 1) setKanzleiWunsch ────────────────────────────────────────────────────

export async function setKanzleiWunsch(input: {
  claim_id: string
  wunsch: KanzleiWunsch
  eigene_kanzlei?: EigeneKanzleiInput
  gefragt_in_phase: 'lead_konvertierung' | 'phase_4_re_frage' | 'kb_override'
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer', 'kunde', 'dispatch'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (input.wunsch === 'eigene_kanzlei') {
    const k = input.eigene_kanzlei
    if (!k?.name?.trim()) {
      return { ok: false, error: 'Bei eigener Kanzlei ist der Name Pflicht' }
    }
    if (!k.email?.trim() && !k.telefon?.trim()) {
      return { ok: false, error: 'Bei eigener Kanzlei ist Email oder Telefon Pflicht' }
    }
  }

  // Aaron-Anpassung 3: KB-Override darf bei bereits versendetem Paket nicht
  // mehr ändern — Daten-Konsistenz mit kanzlei_pakete + UI-Block. Edge-Case
  // (Kunde widerruft nach Paket-Versand) wird über Admin-Eskalation gelöst.
  if (input.gefragt_in_phase === 'kb_override') {
    const adminClient = createAdminClient()
    const { data: aktivesPaket } = await adminClient
      .from('kanzlei_pakete')
      .select('id, status')
      .eq('claim_id', input.claim_id)
      .in('status', ['versendet', 'bestaetigt'])
      .maybeSingle()
    if (aktivesPaket) {
      return {
        ok: false,
        error: 'Kanzlei-Paket bereits versendet — Wunsch nicht mehr änderbar. Bitte Admin kontaktieren.',
      }
    }
  }

  const admin = createAdminClient()
  const { error: updErr } = await admin
    .from('claims')
    .update({
      kanzlei_wunsch:                  input.wunsch,
      kanzlei_wunsch_gefragt_am:       new Date().toISOString(),
      kanzlei_wunsch_gefragt_in_phase: input.gefragt_in_phase,
    })
    .eq('id', input.claim_id)

  if (updErr) return { ok: false, error: updErr.message }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx

  revalidatePath(`/faelle/${ctx.fallId}`)

  // Auto-Paket-Logik: nur wenn Wunsch "partnerkanzlei" oder "eigene_kanzlei"
  // UND Phase ist >= 4 (Gutachten ist da, Paket-Inhalt komplett genug)
  let autoPaketResult: ActionResult | null = null
  if (
    (input.wunsch === 'partnerkanzlei' || input.wunsch === 'eigene_kanzlei') &&
    ctx.phase !== null &&
    PHASEN_AB_4.has(ctx.phase)
  ) {
    autoPaketResult = await sendKanzleiPaket({
      claim_id:       input.claim_id,
      empfaenger_typ: input.wunsch,
      eigene_kanzlei: input.eigene_kanzlei,
    })
  }

  return {
    ok: true,
    data: {
      auto_paket_versendet: autoPaketResult?.ok === true,
      auto_paket_error:     autoPaketResult?.ok === false ? autoPaketResult.error : null,
    },
  }
}

// ── 2) sendKanzleiPaket ────────────────────────────────────────────────────

export async function sendKanzleiPaket(input: {
  claim_id: string
  empfaenger_typ: EmpfaengerTyp
  eigene_kanzlei?: EigeneKanzleiInput
  versand_methode?: 'email' | 'post' | 'portal_lexdrive'
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx

  // Empfänger bestimmen
  let empfaengerName:    string
  let empfaengerEmail:   string | null = null
  let empfaengerTel:     string | null = null
  let empfaengerKontakt: string | null = null

  if (input.empfaenger_typ === 'partnerkanzlei') {
    const partner = await getPartnerKanzleiSettings()
    if (!partner) return { ok: false, error: 'Partnerkanzlei-Settings nicht konfiguriert' }
    empfaengerName    = partner.name
    empfaengerEmail   = partner.email
    empfaengerTel     = partner.telefon
    empfaengerKontakt = partner.kontaktperson
  } else {
    const k = input.eigene_kanzlei
    if (!k?.name?.trim()) return { ok: false, error: 'eigene_kanzlei.name ist Pflicht' }
    if (!k.email?.trim() && !k.telefon?.trim()) {
      return { ok: false, error: 'eigene_kanzlei: Email oder Telefon Pflicht' }
    }
    empfaengerName    = k.name
    empfaengerEmail   = k.email    ?? null
    empfaengerTel     = k.telefon  ?? null
    empfaengerKontakt = k.kontaktperson ?? null
  }

  const versandMethode: 'email' | 'post' | 'portal_lexdrive' =
    input.versand_methode ??
    (input.empfaenger_typ === 'partnerkanzlei' ? 'portal_lexdrive' : 'email')

  // Inhalt-Manifest aus Sub-Assets zusammenstellen
  const inhalt = await buildPaketInhalt(input.claim_id)

  // 1) Paket als Entwurf anlegen
  const admin = createAdminClient()
  const { data: paket, error: insertErr } = await admin
    .from('kanzlei_pakete')
    .insert({
      claim_id:                          input.claim_id,
      empfaenger_typ:                    input.empfaenger_typ,
      empfaenger_kanzlei_name:           empfaengerName,
      empfaenger_kanzlei_email:          empfaengerEmail,
      empfaenger_kanzlei_telefon:        empfaengerTel,
      empfaenger_kanzlei_kontaktperson:  empfaengerKontakt,
      inhalt_dokumente_jsonb:            inhalt,
      status:                            'entwurf',
      versand_methode:                   versandMethode,
      versendet_durch_user_id:           auth.user.id,
    })
    .select('id')
    .single()

  if (insertErr || !paket) return { ok: false, error: insertErr?.message ?? 'Paket-Insert fehlgeschlagen' }

  // 2) Versand
  let versandOk = false
  let externalId: string | null = null
  let versandFehler: string | null = null

  if (versandMethode === 'email') {
    if (!empfaengerEmail) {
      versandFehler = 'Empfänger-Email fehlt'
    } else {
      try {
        const result = await sendEmail({
          to:           empfaengerEmail,
          subject:      `Kanzlei-Paket Schadenfall · ${input.claim_id.slice(0, 8)}`,
          html:         buildEmailHtml(inhalt, empfaengerKontakt),
          empfaengerTyp: 'kanzlei',
          fallId:       ctx.fallId,
          template:     'aar841_kanzlei_paket',
        })
        externalId = result.messageId
        versandOk  = true
      } catch (err) {
        versandFehler = err instanceof Error ? err.message : String(err)
      }
    }
  } else if (versandMethode === 'post') {
    // KB druckt manuell — Paket bleibt auf 'entwurf' bis manuell als versendet markiert
    versandOk = false
    versandFehler = 'Post-Versand: KB druckt manuell, dann via resendKanzleiPaket bestätigen'
  } else if (versandMethode === 'portal_lexdrive') {
    // LexDrive-Portal-API ist Out-of-Scope — fallback auf email
    if (!empfaengerEmail) {
      versandFehler = 'LexDrive-Portal nicht konfiguriert + Email fehlt'
    } else {
      try {
        const result = await sendEmail({
          to:           empfaengerEmail,
          subject:      `[LexDrive] Schadenfall ${input.claim_id.slice(0, 8)}`,
          html:         buildEmailHtml(inhalt, empfaengerKontakt),
          empfaengerTyp: 'kanzlei',
          fallId:       ctx.fallId,
          template:     'aar841_kanzlei_paket_partner',
        })
        externalId = result.messageId
        versandOk  = true
      } catch (err) {
        versandFehler = err instanceof Error ? err.message : String(err)
      }
    }
  }

  // 3) Status-Update
  const { error: statusErr } = await admin
    .from('kanzlei_pakete')
    .update({
      status:               versandOk ? 'versendet' : 'fehlgeschlagen',
      versendet_am:         versandOk ? new Date().toISOString() : null,
      versand_external_id:  externalId,
      notiz:                versandFehler,
    })
    .eq('id', paket.id)
  if (statusErr) console.error('[AAR-841] Status-Update fehlgeschlagen:', statusErr.message)

  if (!versandOk) {
    revalidatePath(`/faelle/${ctx.fallId}`)
    return { ok: false, error: versandFehler ?? 'Versand fehlgeschlagen' }
  }

  // 4) Bei eigene_kanzlei: claim auf an_externe_kanzlei_uebergeben (Endzustand)
  if (input.empfaenger_typ === 'eigene_kanzlei') {
    try {
      await markClaimAsAnExterneKanzlei({
        claim_id:        input.claim_id,
        kanzlei_name:    empfaengerName,
        uebergabe_datum: new Date().toISOString().slice(0, 10),
        grund:           `Kanzlei-Paket via ${versandMethode} an ${empfaengerName} versendet`,
        notify_customer: true,
      })
    } catch (err) {
      console.error('[AAR-841] markClaimAsAnExterneKanzlei fehlgeschlagen:', err)
    }
  }

  // 5) Notification an Geschädigten
  try {
    await emitEvent(
      'claim.kanzlei_paket_versendet',
      {
        claimId:       input.claim_id,
        fallId:        ctx.fallId,
        empfaengerTyp: input.empfaenger_typ,
        kanzleiName:   empfaengerName,
      },
      { fallId: ctx.fallId, triggeredBy: auth.user.id },
    )
  } catch (err) {
    console.error('[AAR-841] emit claim.kanzlei_paket_versendet failed:', err)
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true, data: { paket_id: paket.id } }
}

// ── 3) resendKanzleiPaket ──────────────────────────────────────────────────

export async function resendKanzleiPaket(input: { paket_id: string }): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  const admin = createAdminClient()
  const { data: paket, error: fetchErr } = await admin
    .from('kanzlei_pakete')
    .select('id, claim_id, empfaenger_typ, status')
    .eq('id', input.paket_id)
    .maybeSingle()

  if (fetchErr || !paket) return { ok: false, error: 'Paket nicht gefunden' }
  if (paket.status !== 'fehlgeschlagen') {
    return { ok: false, error: 'Resend nur für status=fehlgeschlagen erlaubt' }
  }

  // Re-Send durch Wiederaufruf von sendKanzleiPaket — neue Row, alte bleibt als Audit
  return sendKanzleiPaket({
    claim_id:       paket.claim_id as string,
    empfaenger_typ: paket.empfaenger_typ as EmpfaengerTyp,
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildPaketInhalt(claimId: string): Promise<Array<{ type: string; url?: string; name?: string }>> {
  const admin = createAdminClient()
  const inhalt: Array<{ type: string; url?: string; name?: string }> = []

  // Gutachten-Final-PDFs
  const { data: gutachten } = await admin
    .from('gutachten')
    .select('id, status')
    .eq('claim_id', claimId)
    .eq('status', 'final')
  for (const g of (gutachten ?? [])) {
    inhalt.push({ type: 'gutachten', name: `Gutachten ${(g.id as string).slice(0, 8)}` })
  }

  // VS-Korrespondenz
  const { data: vsk } = await admin
    .from('vs_korrespondenz')
    .select('id, typ, datum')
    .eq('claim_id', claimId)
    .neq('status', 'archiviert')
    .order('datum', { ascending: true })
  for (const v of (vsk ?? [])) {
    inhalt.push({ type: 'vs_korrespondenz', name: `${v.typ ?? 'Brief'} (${v.datum ?? 'unbekannt'})` })
  }

  // Repairs
  const { data: repairs } = await admin
    .from('repairs')
    .select('id, status')
    .eq('claim_id', claimId)
  for (const r of (repairs ?? [])) {
    inhalt.push({ type: 'repair', name: `Reparatur ${(r.id as string).slice(0, 8)} (${r.status})` })
  }

  return inhalt
}

function buildEmailHtml(
  inhalt: Array<{ type: string; url?: string; name?: string }>,
  kontaktperson: string | null,
): string {
  const greet = kontaktperson ? `<p>Sehr geehrte/r ${kontaktperson},</p>` : '<p>Sehr geehrte Damen und Herren,</p>'
  const list = inhalt.length === 0
    ? '<p>Aktuell sind keine Sub-Asset-Dokumente erfasst — die Bearbeitung erfolgt manuell.</p>'
    : '<ul>' + inhalt.map((i) => `<li>${i.name ?? i.type}</li>`).join('') + '</ul>'
  return `${greet}
<p>im Anhang erhalten Sie das Kanzlei-Paket zu einem Schadenfall, den unser Mandant Ihnen zur weiteren Bearbeitung übergeben hat.</p>
<p><strong>Inhalt des Pakets:</strong></p>
${list}
<p>Bei Rückfragen erreichen Sie uns unter <a href="mailto:kanzlei@claimondo.de">kanzlei@claimondo.de</a>.</p>
<p style="color:#888;font-size:12px;margin-top:24px">Claimondo — Schadenmanagement</p>`
}
