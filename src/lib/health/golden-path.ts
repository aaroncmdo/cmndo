/**
 * Golden-Path E2E-Harness (Spec 2026-07-02): treibt EINEN synthetischen Fall durch die
 * echte Kern-Pipeline (Lead -> Claim -> SV-Zuweisung -> Gutachten -> Billing -> Kanzlei ->
 * Regulierung -> Abschluss) via die echten server-seitigen lib-Funktionen, assertet nach
 * jeder Stufe den DB-Zustand, und raeumt die Testdaten hart auf.
 *
 * Comms-Safety: Test-Kontakte sind @claimondo.test (Safety-Nets greifen), der Test-SV ist
 * inaktiv, keine reale Kanzlei-Bindung. Marker: leads.source_channel='golden_path'.
 *
 * Rollen-Sichtbarkeit (§4b) wird in Task 4 ergaenzt.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { pushMandatToKanzlei } from '@/lib/kanzlei/push-mandat'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { ensureGoldenPathFixtures } from './golden-path-fixtures'

type Db = ReturnType<typeof createAdminClient>
const LEAD_MARKER = 'golden_path'

export type StageResult = { stage: string; ok: boolean; detail: string; ms: number }
export type GoldenPathReport = {
  ok: boolean
  stages: StageResult[]
  fallId: string | null
  claimId: string | null
  cleanedUp: boolean
  error?: string
}

export async function runGoldenPath(): Promise<GoldenPathReport> {
  const admin = createAdminClient()
  const stages: StageResult[] = []
  let fallId: string | null = null
  let claimId: string | null = null
  let leadId: string | null = null
  let cleanedUp = false

  const stage = async (name: string, fn: () => Promise<string>): Promise<void> => {
    const t0 = performance.now()
    try {
      const detail = await fn()
      stages.push({ stage: name, ok: true, detail, ms: Math.round(performance.now() - t0) })
    } catch (err) {
      stages.push({ stage: name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Math.round(performance.now() - t0) })
      throw err
    }
  }

  // Soft-Stage: erfasst das Ergebnis, wirft aber NICHT. Fuer diagnostische Checks (Rollen-
  // Sicht), die die admin-getriebene Pipeline nicht blocken sollen — so sammelt der Harness
  // ALLE Bruchstellen statt beim ersten abzubrechen.
  const softStage = async (name: string, fn: () => Promise<string>): Promise<void> => {
    const t0 = performance.now()
    try {
      const detail = await fn()
      stages.push({ stage: name, ok: true, detail, ms: Math.round(performance.now() - t0) })
    } catch (err) {
      stages.push({ stage: name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Math.round(performance.now() - t0) })
    }
  }

  // Eine Status-Transition treiben + verifizieren (Cursor = claims.operative_status).
  const driveTo = (target: string) =>
    stage(`status:${target}`, async () => {
      await transitionFallStatus(fallId!, target, { user_id: undefined })
      const { data } = await admin.from('claims').select('operative_status').eq('id', claimId!).single()
      if (data?.operative_status !== target) throw new Error(`erwartet ${target}, ist ${data?.operative_status ?? 'NULL'}`)
      return target
    })

  try {
    await preCleanup(admin)
    const fx = await ensureGoldenPathFixtures()

    await stage('lead', async () => {
      const r = await createLead(
        admin,
        {
          source_channel: LEAD_MARKER,
          status: 'neu',
          email: `golden-path+${Date.now()}@claimondo.test`,
          vorname: 'GoldenPath',
          nachname: 'Smoke',
          telefon: '+490000000000',
        },
      )
      if (!r.ok) throw new Error(r.error)
      leadId = r.leadId
      return `lead=${leadId}`
    })

    await stage('claim', async () => {
      const r = await convertLeadToFall(admin, leadId!, fx.kbUserId)
      fallId = r.fallId
      claimId = await resolveClaimId(admin, fallId!)
      if (!claimId) throw new Error('claimId nicht aufloesbar')
      const { data } = await admin.from('claims').select('operative_status').eq('id', claimId).single()
      if (!data) throw new Error('Claim nach Konvertierung nicht gefunden')
      return `claim=${claimId} status=${data.operative_status ?? 'NULL'}`
    })

    // §4b Rollen-Sicht: Kunde sieht eigenen Claim (positiv) + fremder User NICHT (negativ).
    await softStage('rolle:kunde-sicht', () => assertVisible(admin, claimId!, fx.kundeUserId, 'kunde', true))
    await softStage('rolle:fremd-negativ', () => assertVisible(admin, claimId!, '00000000-0000-0000-0000-000000000000', 'fremd', false))

    await stage('sv-zuweisung', async () => {
      await setSvIdForFall(admin, fallId!, fx.svId)
      const { data } = await admin.from('claims').select('sv_id').eq('id', claimId!).single()
      if (data?.sv_id !== fx.svId) throw new Error(`sv_id nicht gesetzt (ist ${data?.sv_id ?? 'NULL'})`)
      return `sv_id=${fx.svId}`
    })

    // §4b Rollen-Sicht nach Zuweisung: der zugewiesene SV MUSS seinen Fall sehen (Kern-
    // Hypothese der 84->2-Klippe: SV sieht Fall nicht -> liefert kein Gutachten) + der betreuende KB.
    await softStage('rolle:sv-sicht', () => assertVisible(admin, claimId!, fx.svUserId, 'sv', true))
    await softStage('rolle:kb-sicht', () => assertVisible(admin, claimId!, fx.kbUserId, 'kb', true))

    // Initial-Status (i.d.R. 'ersterfassung') -> 'sv-zugewiesen', falls noch nicht dort
    // (ersterfassung -> sv-zugewiesen ist im FALL_STATUS_TRANSITIONS-Graph gueltig).
    await stage('status:sv-zugewiesen', async () => {
      const { data: cur } = await admin.from('claims').select('operative_status').eq('id', claimId!).single()
      if (cur?.operative_status !== 'sv-zugewiesen') {
        await transitionFallStatus(fallId!, 'sv-zugewiesen', { user_id: undefined })
      }
      const { data } = await admin.from('claims').select('operative_status').eq('id', claimId!).single()
      if (data?.operative_status !== 'sv-zugewiesen') throw new Error(`erwartet sv-zugewiesen, ist ${data?.operative_status ?? 'NULL'}`)
      return 'sv-zugewiesen'
    })

    await driveTo('sv-termin')
    await driveTo('besichtigung')

    await stage('gutachten+billing', async () => {
      const { error: gErr } = await admin.from('gutachten').upsert(
        { claim_id: claimId!, sv_id: fx.svId, fertiggestellt_am: new Date().toISOString(), gesamt_schadensbetrag: 5500 },
        { onConflict: 'claim_id' },
      )
      if (gErr) throw new Error(`gutachten-upsert: ${gErr.message}`)
      // Feuert per State-Machine-Hook processCaseBilling (AAR-924).
      await transitionFallStatus(fallId!, 'gutachten-eingegangen', { user_id: fx.kbUserId })
      const { data } = await admin.from('claims').select('operative_status, lead_preis_netto').eq('id', claimId!).single()
      if (data?.operative_status !== 'gutachten-eingegangen') throw new Error(`status=${data?.operative_status ?? 'NULL'}`)
      if (data?.lead_preis_netto == null) throw new Error('Billing-Hook feuerte nicht (lead_preis_netto NULL)')
      return `status=gutachten-eingegangen lead_preis=${data.lead_preis_netto}`
    })

    await driveTo('filmcheck')
    await driveTo('kanzlei-uebergeben')

    await stage('mandat-push', async () => {
      const r = await pushMandatToKanzlei(fallId!)
      if (!('success' in r)) throw new Error('unerwartete Rueckgabe von pushMandatToKanzlei')
      // test-safe: success ODER skipped:true beide ok (externer Push bewusst geblockt)
      return r.success ? 'pushed' : `skipped:${(r as { skipped?: boolean }).skipped ?? false}`
    })

    await driveTo('anschlussschreiben')
    await driveTo('regulierung')
    await driveTo('zahlung-eingegangen')
    await driveTo('abgeschlossen')
  } catch {
    /* Fehler ist bereits als Stage-Result erfasst; finally raeumt auf */
  } finally {
    try {
      if (fallId || claimId) {
        await admin.rpc('delete_fall_komplett', { p_fall_id: fallId, p_claim_id: claimId })
      }
      if (leadId) await admin.from('leads').delete().eq('id', leadId)
      cleanedUp = true
    } catch (err) {
      stages.push({ stage: 'cleanup', ok: false, detail: err instanceof Error ? err.message : String(err), ms: 0 })
    }
  }

  return { ok: stages.every((s) => s.ok), stages, fallId, claimId, cleanedUp }
}

/**
 * Idempotentes Pre-Cleanup: entfernt Reste eines evtl. abgebrochenen Vorlaufs.
 * Findet golden-path-Leads (source_channel-Marker) -> ihre Claims -> fall_id via Bridge
 * -> delete_fall_komplett; dann die Leads.
 */
/**
 * §4b Rollen-Sicht: prueft via JWT-Sim-Helper (Migration 20260702100933), ob p_user_id den
 * Claim unter RLS saehe. Die generierten Types wurden bewusst nicht regeneriert (Regel 2) ->
 * gezielter rpc-Cast auf diese eine Health-Helper-Funktion.
 */
async function assertVisible(admin: Db, claimId: string, userId: string, label: string, expected: boolean): Promise<string> {
  const rpc = admin.rpc as unknown as (
    fn: 'golden_path_claim_visible_for',
    args: { p_claim_id: string; p_user_id: string },
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>
  const { data, error } = await rpc('golden_path_claim_visible_for', { p_claim_id: claimId, p_user_id: userId })
  if (error) throw new Error(`visibility-rpc (${label}): ${error.message}`)
  if (Boolean(data) !== expected) throw new Error(`${label}: sichtbar=${data}, erwartet ${expected}`)
  return `${label}=${data}`
}

async function preCleanup(admin: Db): Promise<void> {
  const { data: gpLeads } = await admin.from('leads').select('id').eq('source_channel', LEAD_MARKER)
  const leadIds = (gpLeads ?? []).map((l) => l.id as string)
  if (leadIds.length === 0) return
  const { data: gpClaims } = await admin.from('claims').select('id').in('lead_id', leadIds)
  for (const c of gpClaims ?? []) {
    const cid = c.id as string
    const { data: bridge } = await admin.from('faelle_claim_bridge').select('fall_id').eq('claim_id', cid).maybeSingle()
    await admin.rpc('delete_fall_komplett', { p_fall_id: (bridge?.fall_id as string | null) ?? null, p_claim_id: cid })
  }
  await admin.from('leads').delete().in('id', leadIds)
}
