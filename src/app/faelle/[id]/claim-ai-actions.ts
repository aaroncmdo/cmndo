'use server'

// Freigabe-Executor fuer die Claim-AI-Konsole.
// Hybrid: task → buildTaskFromProposal; add_note → logFallEvent (auto);
// draft_message → ausfuehrung_ergebnis={kind:'draft'} KEIN Send (2. Klick = sendeClaimAiEntwurf).
//
// ID-Dualitaet (KRITISCH):
//   - ai_claim_proposals.claim_id   = CLAIM-ID  → buildTaskFromProposal, proposals-Loader
//   - Route-Param fallId             = FALL-ID   → logFallEvent, revalidatePath

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideProposal } from '@/lib/orchestrator/proposals'
import { buildTaskFromProposal } from '@/lib/orchestrator/task-from-proposal'
import { logFallEvent } from '@/lib/fall/log-event'
import { sendChatMessage } from '@/lib/communications/send-chat'
import { VERB_KIND } from '@/lib/claim-ai/verbs'
import type { ChatKanal } from '@/lib/communications/channels'
import type { TaskProposalPayload } from '@/lib/orchestrator/types'
import { requireAdminUserId } from '@/lib/auth/require-admin-user-id'

// ── freigebenClaimAiVorschlag ─────────────────────────────────────────────────

export async function freigebenClaimAiVorschlag(
  proposalId: string,
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const db = createAdminClient()

  // Proposal laden — claim_id ist CLAIM-ID, fallId ist FALL-ID (Route-Param)
  const { data: p } = await db
    .from('ai_claim_proposals')
    .select('id, claim_id, vorschlag_typ, ziel_rolle, payload, begruendung, status, ausfuehrung_ergebnis')
    .eq('id', proposalId)
    .maybeSingle()

  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }

  // Idempotenz-Guard: nur offene Vorschlaege verarbeiten
  if (p.status !== 'offen') return { ok: false, error: 'bereits bearbeitet' }

  const claimId = p.claim_id as string
  const payload = (p.payload ?? {}) as Record<string, unknown>
  const typ = p.vorschlag_typ as string

  // Kind bestimmen aus VERB_KIND-Registry
  const kind = VERB_KIND[typ as keyof typeof VERB_KIND] ?? 'auto'

  if (kind === 'task') {
    // task → buildTaskFromProposal mit CLAIM-ID (nicht fallId)
    const { task_id } = await buildTaskFromProposal(
      payload as TaskProposalPayload,
      p.ziel_rolle as string | null,
      claimId,
      'claim_ai_copilot',
    )
    if (!task_id) return { ok: false, error: 'Task-Erstellung fehlgeschlagen' }
  } else if (kind === 'auto') {
    // add_note → logFallEvent mit FALL-ID (nicht claim_id)
    try {
      await logFallEvent(db, {
        fallId,
        typ: 'system',
        titel: (payload.titel as string | undefined) ?? 'KI-Notiz',
        beschreibung: payload.text as string | undefined,
        actor: userId,
      })
    } catch (err) {
      console.error('[claim-ai] logFallEvent failed:', err)
    }
  } else if (kind === 'draft') {
    // draft_message → NUR ausfuehrung_ergebnis setzen, kein Send (DSGVO Art.22)
    await db
      .from('ai_claim_proposals')
      .update({ ausfuehrung_ergebnis: { kind: 'draft' } })
      .eq('id', proposalId)
  }

  // Proposal-Status auf 'angenommen' setzen
  const res = await decideProposal(proposalId, 'angenommen', userId)
  if (!res.ok) return res

  // Timeline-Event (non-critical)
  try {
    await logFallEvent(db, {
      fallId,
      typ: 'system',
      titel: 'KI-Vorschlag freigegeben',
      beschreibung: p.begruendung as string | undefined,
      actor: userId,
    })
  } catch (err) {
    console.error('[claim-ai] timeline logFallEvent failed:', err)
  }

  revalidatePath('/faelle/' + fallId)
  return { ok: true }
}

// ── verwerfenClaimAiVorschlag ─────────────────────────────────────────────────

export async function verwerfenClaimAiVorschlag(
  proposalId: string,
  fallId: string,
  feedback?: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const db = createAdminClient()

  // Idempotenz-Guard (konsistent mit freigeben): nur offene Vorschlaege
  // verwerfen — schuetzt die Audit-Spur vor Doppel-Entscheidung.
  const { data: p } = await db
    .from('ai_claim_proposals')
    .select('status')
    .eq('id', proposalId)
    .maybeSingle()
  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }
  if (p.status !== 'offen') return { ok: false, error: 'bereits bearbeitet' }

  const res = await decideProposal(proposalId, 'verworfen', userId, feedback)
  if (!res.ok) return res

  revalidatePath('/faelle/' + fallId)
  return { ok: true }
}

// ── sendeClaimAiEntwurf ───────────────────────────────────────────────────────
// 2. Klick: nur ausfuehren wenn vorschlag_typ=draft_message && status=angenommen.
// Sendet ueber den kanonischen Free-Text-Pfad sendChatMessage(fallId, kanal, nachricht)
// — derselbe Weg, den die manuelle Chat-UI nutzt (persistiert in nachrichten,
// bei whatsapp zusaetzlich Twilio-outbound). KEIN Registry-Key noetig.
// Kanal-Mapping: der Verb-Payload kennt 'email'|'sms'|'whatsapp' (CLAIM_AI_TOOLS),
// ChatKanal kennt aber kein email/sms → whatsapp bleibt whatsapp, alles andere geht
// ueber den Standard-Kunde-Kanal 'chat_kb_kunde' (Kunde-gerichtete Ausgangsnachricht).
// Outbound-Safety: bei bereits gesetztem sent_at wird NICHT erneut gesendet.

function draftKanalToChatKanal(kanal: string | undefined): ChatKanal {
  return kanal === 'whatsapp' ? 'whatsapp' : 'chat_kb_kunde'
}

export async function sendeClaimAiEntwurf(
  proposalId: string,
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const db = createAdminClient()

  const { data: p } = await db
    .from('ai_claim_proposals')
    .select('id, vorschlag_typ, payload, status, ausfuehrung_ergebnis')
    .eq('id', proposalId)
    .maybeSingle()

  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }

  // Guard: nur freigegebene draft_message-Vorschlaege senden
  if (p.vorschlag_typ !== 'draft_message') {
    return { ok: false, error: 'Nur draft_message-Vorschlaege koennen gesendet werden' }
  }
  if (p.status !== 'angenommen') {
    return { ok: false, error: 'Entwurf muss zuerst freigegeben werden' }
  }

  // Doppel-Send-Guard (Outbound-Safety): niemals den Kunden zweimal kontaktieren.
  const ergebnis = (p.ausfuehrung_ergebnis ?? null) as { sent_at?: string } | null
  if (ergebnis?.sent_at) return { ok: false, error: 'Bereits gesendet' }

  const payload = (p.payload ?? {}) as Record<string, unknown>
  const nachricht = (payload.text as string | undefined) ?? ''
  const kanal = draftKanalToChatKanal(payload.kanal as string | undefined)

  // Kanonischer Free-Text-Send (gleicher Pfad wie manuelle Chat-UI).
  const sendRes = await sendChatMessage({ fallId, kanal, nachricht })
  if (!sendRes.success) {
    console.error('[claim-ai] sendChatMessage failed:', sendRes.error)
    return { ok: false, error: sendRes.error ?? 'Senden fehlgeschlagen' }
  }

  // Sent-Marker erst NACH erfolgreichem Send setzen.
  const sentAt = new Date().toISOString()
  await db
    .from('ai_claim_proposals')
    .update({
      ausfuehrung_ergebnis: { kind: 'draft', sent_at: sentAt },
    })
    .eq('id', proposalId)

  revalidatePath('/faelle/' + fallId)
  return { ok: true }
}
