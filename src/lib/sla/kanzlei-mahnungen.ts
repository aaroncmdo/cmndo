// AAR-431: Mahnungs-Logik für Kanzlei-SLAs.
// Bei Breach wird je nach Blocker die Kanzlei (Email), der Kunde (WhatsApp +
// Portal-System-Message) oder der SV (KB-Task) gemahnt. Stufen 1/2/3 werden
// über n_mahnungen + letzte_mahnung_am getrackt.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { sendWhatsApp } from '@/lib/whatsapp'
import { createAutoTask } from '@/lib/tasking'
import { addWorkingDays, workingDaysBetween } from './workdays'
import { detectBlocker, type KanzleiSlaTyp, type BlockerInfo } from './blocker-detection'

export type MahnungsStufe = 1 | 2 | 3

export interface SlaRecord {
  id: string
  fall_id: string
  sla_typ: KanzleiSlaTyp
  status: string
  started_at: string
  breach_at: string
  n_mahnungen: number | null
  letzte_mahnung_am: string | null
  phase: string | null
  blocker_rolle: string | null
  blocker_grund: string | null
}

interface FallKontext {
  id: string
  claim_nummer: string | null
  kanzlei_id: string | null
  kundenbetreuer_id: string | null
  kuerzungs_betrag: number | null
}

const REPLY_TO = 'aaron.sprafke@claimondo.de'

// ─── Email-Templates pro (slaTyp × stufe) ──────────────────────────────────

function buildKanzleiEmailHtml(
  slaTyp: KanzleiSlaTyp,
  stufe: MahnungsStufe,
  ctx: { fallNummer: string; ansprechpartner: string; kuerzungBetrag?: string; portalUrl: string },
): { subject: string; html: string } {
  const { fallNummer, ansprechpartner, kuerzungBetrag, portalUrl } = ctx
  const anrede = ansprechpartner ? `Hallo ${ansprechpartner},` : 'Sehr geehrte Damen und Herren,'
  const cta = `<p><a href="${portalUrl}" style="display:inline-block;padding:10px 20px;background:#0D1B3E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Fall im Kanzlei-Portal öffnen</a></p>`

  if (slaTyp === 'kanzlei_as_versand') {
    if (stufe === 1) {
      return {
        subject: `Erinnerung: Anschlussschreiben für Fall ${fallNummer} überfällig`,
        html: `<p>${anrede}</p><p>das Anschlussschreiben für Fall <strong>${fallNummer}</strong> ist seit 2 Werktagen überfällig. Bitte versenden Sie es zeitnah an die Versicherung.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
      }
    }
    if (stufe === 2) {
      return {
        subject: `2. Mahnung: Anschlussschreiben für Fall ${fallNummer}`,
        html: `<p>${anrede}</p><p>wir erinnern Sie erneut: das Anschlussschreiben für Fall <strong>${fallNummer}</strong> ist weiterhin offen. Bitte reagieren Sie umgehend.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
      }
    }
    return {
      subject: `LETZTE MAHNUNG: Anschlussschreiben Fall ${fallNummer}`,
      html: `<p>${anrede}</p><p>dies ist unsere letzte Erinnerung zum Anschlussschreiben für Fall <strong>${fallNummer}</strong>. Ohne Reaktion prüfen wir einen Kanzlei-Wechsel.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
    }
  }

  if (slaTyp === 'kanzlei_ruege_versand') {
    if (stufe === 1) {
      return {
        subject: `Erinnerung: Rüge für Fall ${fallNummer} ausstehend`,
        html: `<p>${anrede}</p><p>die technische Stellungnahme für Fall <strong>${fallNummer}</strong> liegt Ihnen vor — die Rüge ist seit 2 Werktagen überfällig. Bitte versenden Sie sie zeitnah.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
      }
    }
    if (stufe === 2) {
      return {
        subject: `2. Mahnung: Rüge für Fall ${fallNummer}`,
        html: `<p>${anrede}</p><p>erneute Erinnerung zur Rüge für Fall <strong>${fallNummer}</strong>. Bitte reagieren Sie umgehend.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
      }
    }
    return {
      subject: `LETZTE MAHNUNG: Rüge Fall ${fallNummer}`,
      html: `<p>${anrede}</p><p>dies ist die letzte Erinnerung zur Rüge für Fall <strong>${fallNummer}</strong>. Ohne Reaktion erfolgt Eskalation.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
    }
  }

  if (slaTyp === 'kanzlei_kuerzung_antwort') {
    const betragStr = kuerzungBetrag ? ` (Kürzungsbetrag: ${kuerzungBetrag})` : ''
    if (stufe === 1) {
      return {
        subject: `Einschätzung zur VS-Kürzung — Fall ${fallNummer}`,
        html: `<p>${anrede}</p><p>die Versicherung hat im Fall <strong>${fallNummer}</strong>${betragStr} gekürzt. Wir benötigen Ihre Einschätzung innerhalb der SLA-Frist (3 Werktage). Diese ist nun überschritten.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
      }
    }
    if (stufe === 2) {
      return {
        subject: `2. Mahnung: Einschätzung VS-Kürzung Fall ${fallNummer}`,
        html: `<p>${anrede}</p><p>wir warten weiterhin auf Ihre Einschätzung zur VS-Kürzung im Fall <strong>${fallNummer}</strong>${betragStr}.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
      }
    }
    return {
      subject: `LETZTE MAHNUNG: Einschätzung VS-Kürzung Fall ${fallNummer}`,
      html: `<p>${anrede}</p><p>letzte Mahnung zur VS-Kürzungs-Einschätzung Fall <strong>${fallNummer}</strong>${betragStr}. Ohne Reaktion erfolgt Eskalation.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
    }
  }

  // kanzlei_vs_nachfass
  if (stufe === 1) {
    return {
      subject: `VS-Nachfassung erforderlich — Fall ${fallNummer}`,
      html: `<p>${anrede}</p><p>die Versicherung hat im Fall <strong>${fallNummer}</strong> nicht fristgerecht reagiert. Bitte führen Sie die VS-Nachfassung durch.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
    }
  }
  if (stufe === 2) {
    return {
      subject: `2. Mahnung: VS-Nachfassung Fall ${fallNummer}`,
      html: `<p>${anrede}</p><p>weiterhin keine VS-Nachfassung im Fall <strong>${fallNummer}</strong>. Bitte umgehend bearbeiten.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
    }
  }
  return {
    subject: `LETZTE MAHNUNG: VS-Nachfassung Fall ${fallNummer}`,
    html: `<p>${anrede}</p><p>letzte Mahnung zur VS-Nachfassung Fall <strong>${fallNummer}</strong>.</p>${cta}<p>Viele Grüße<br>Ihr Claimondo-Team</p>`,
  }
}

// ─── Kanzlei-Mail ──────────────────────────────────────────────────────────

/**
 * Schickt eine Mahnung an die Kanzlei (Email). Wenn keine Kanzlei-Email
 * hinterlegt ist, wird ein KB-Task „Kanzlei-Email fehlt" erstellt.
 */
export async function sendKanzleiMahnung(
  fall: FallKontext,
  slaTyp: KanzleiSlaTyp,
  stufe: MahnungsStufe,
): Promise<{ gesendet: boolean; grund?: string }> {
  const db = createAdminClient()

  if (!fall.kanzlei_id) {
    await createKbNachfassTask(fall, 'kanzlei-nachfassen', null, 'dringend', 'Kein Kanzlei-Zuordnung am Fall — bitte prüfen')
    return { gesendet: false, grund: 'Keine Kanzlei am Fall verknüpft' }
  }

  const { data: kanzlei } = await db
    .from('kanzleien')
    .select('id, name, email, ansprechpartner')
    .eq('id', fall.kanzlei_id)
    .maybeSingle()

  if (!kanzlei?.email) {
    await createKbNachfassTask(
      fall,
      'kanzlei-nachfassen',
      null,
      'dringend',
      `Kanzlei-Email fehlt (Kanzlei: ${kanzlei?.name ?? fall.kanzlei_id}). Bitte telefonisch mahnen.`,
    )
    return { gesendet: false, grund: 'Kanzlei-Email fehlt' }
  }

  // KB-CC ermitteln
  let kbEmail: string | null = null
  if (fall.kundenbetreuer_id) {
    const { data: kb } = await db
      .from('profiles')
      .select('email')
      .eq('id', fall.kundenbetreuer_id)
      .maybeSingle()
    kbEmail = kb?.email ?? null
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'
  const portalUrl = `${appUrl}/kanzlei/faelle/${fall.id}`
  const kuerzungBetrag = fall.kuerzungs_betrag
    ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(fall.kuerzungs_betrag))
    : undefined

  const { subject, html } = buildKanzleiEmailHtml(slaTyp, stufe, {
    fallNummer: fall.claim_nummer ?? fall.id.slice(0, 8),
    ansprechpartner: kanzlei.ansprechpartner ?? '',
    kuerzungBetrag,
    portalUrl,
  })

  try {
    // Haupt-Mail an Kanzlei
    await sendEmail({
      to: kanzlei.email,
      replyTo: REPLY_TO,
      subject,
      html,
      template: `sla_${slaTyp}_stufe_${stufe}`,
      empfaengerTyp: 'kanzlei',
      fallId: fall.id,
    })
    // „CC" an KB als separate Info-Mail (sendEmail-Client unterstützt kein cc)
    if (kbEmail) {
      try {
        await sendEmail({
          to: kbEmail,
          replyTo: REPLY_TO,
          subject: `[Info-CC] ${subject}`,
          html: `<p><em>Info-Kopie der an die Kanzlei versendeten Mahnung:</em></p>${html}`,
          template: `sla_${slaTyp}_stufe_${stufe}_kb_cc`,
          empfaengerTyp: 'admin',
          fallId: fall.id,
        })
      } catch (ccErr) {
        console.error('[AAR-431] KB-CC-Mail fehlgeschlagen:', ccErr)
      }
    }
  } catch (err) {
    console.error(`[AAR-431] Kanzlei-Mahnung ${slaTyp} Stufe ${stufe} für Fall ${fall.id} fehlgeschlagen:`, err)
    return { gesendet: false, grund: 'Email-Versand fehlgeschlagen' }
  }

  await db.from('timeline').insert({
    fall_id: fall.id,
    typ: 'system',
    titel: `Kanzlei-Mahnung Stufe ${stufe} versendet`,
    beschreibung: `SLA ${slaTyp} an ${kanzlei.email} (CC: ${kbEmail ?? '—'})`,
  })

  return { gesendet: true }
}

// ─── Kunden-Reminder ───────────────────────────────────────────────────────

/**
 * Kunden-Reminder wenn die Kanzlei auf Kunde wartet (z. B. Vollmacht).
 * Versucht WhatsApp + setzt System-Message ins Portal.
 */
export async function sendKundenReminderWegenKanzlei(
  fall: FallKontext,
  slaTyp: KanzleiSlaTyp,
): Promise<{ waGesendet: boolean }> {
  const db = createAdminClient()

  let waGesendet = false

  // WhatsApp: erst generischen Trigger versuchen, sonst Freitext-Fallback
  const message =
    slaTyp === 'kanzlei_as_versand'
      ? 'Ihre Kanzlei wartet noch auf Unterlagen von Ihnen (z. B. Vollmacht). Bitte in Ihrem Portal prüfen und umgehend erledigen. Ihr Claimondo-Team'
      : 'Wichtig: Ihre Kanzlei wartet auf Ihre Mitwirkung. Bitte öffnen Sie Ihr Claimondo-Portal. Ihr Claimondo-Team'

  try {
    // Telefon aus fall laden
    const { data: fullFall } = await db
      .from('faelle')
      .select('lead_id, kunde_id')
      .eq('id', fall.id)
      .single()

    let telefon: string | null = null
    if (fullFall?.lead_id) {
      const { data: lead } = await db.from('leads').select('telefon').eq('id', fullFall.lead_id).maybeSingle()
      telefon = lead?.telefon ?? null
    }
    if (!telefon && fullFall?.kunde_id) {
      const { data: profile } = await db.from('profiles').select('telefon').eq('id', fullFall.kunde_id).maybeSingle()
      telefon = profile?.telefon ?? null
    }

    if (telefon) {
      const result = await sendWhatsApp(telefon, message)
      waGesendet = result.success
    }
  } catch (err) {
    console.error('[AAR-431] Kunden-WA-Reminder fehlgeschlagen:', err)
  }

  // System-Message ins KB↔Kunde-Channel (CHECK-Constraint erlaubt kein 'system')
  try {
    await db.from('nachrichten').insert({
      fall_id: fall.id,
      kanal: 'chat_kb_kunde',
      sender_rolle: 'system',
      nachricht: message,
      is_system: true,
      system_event: `sla_breach_${slaTyp}`,
    })
  } catch (err) {
    console.error('[AAR-431] System-Nachricht insert fehlgeschlagen:', err)
  }

  // Fallback: wenn kein WA möglich war, optional Email via sendFallCommunication
  if (!waGesendet) {
    try {
      await sendFallCommunication(fall.id, 'kanzlei_wartet_auf_kunde_wa', {
        subject: 'Ihre Kanzlei wartet auf Sie',
        html: `<p>${message}</p>`,
      })
    } catch (err) {
      console.error('[AAR-431] Kunden-Fallback fehlgeschlagen:', err)
    }
  }

  return { waGesendet }
}

// ─── KB-Nachfass-Task ──────────────────────────────────────────────────────

type KbNachfassTyp =
  | 'kanzlei-nachfassen'
  | 'kunde-erinnern-fuer-kanzlei'
  | 'sv-nachfassen-fuer-kanzlei'

export async function createKbNachfassTask(
  fall: FallKontext,
  typ: KbNachfassTyp,
  slaRecord: SlaRecord | null,
  prio: 'normal' | 'dringend' | 'kritisch' = 'dringend',
  zusatzBeschreibung?: string,
): Promise<void> {
  const titelMap: Record<KbNachfassTyp, string> = {
    'kanzlei-nachfassen': `Kanzlei nachfassen — Fall ${fall.claim_nummer ?? fall.id.slice(0, 8)}`,
    'kunde-erinnern-fuer-kanzlei': `Kunde erinnern (Kanzlei wartet) — Fall ${fall.claim_nummer ?? fall.id.slice(0, 8)}`,
    'sv-nachfassen-fuer-kanzlei': `SV nachfassen (Kanzlei wartet) — Fall ${fall.claim_nummer ?? fall.id.slice(0, 8)}`,
  }

  const beschreibung = [
    slaRecord ? `SLA-Typ: ${slaRecord.sla_typ}` : null,
    slaRecord?.blocker_grund ? `Blocker-Grund: ${slaRecord.blocker_grund}` : null,
    zusatzBeschreibung ?? null,
    'Bitte innerhalb von 1 Werktag klären.',
  ]
    .filter(Boolean)
    .join(' · ')

  await createAutoTask({
    fall_id: fall.id,
    empfaenger_id: fall.kundenbetreuer_id ?? null,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: typ,
    titel: titelMap[typ],
    beschreibung,
    deadline: addWorkingDays(new Date(), 1),
    prioritaet: prio,
    phase: slaRecord?.phase ?? undefined,
  })
}

// ─── Breach-Handler ────────────────────────────────────────────────────────

/**
 * Vollständiger Breach-Flow. Wird vom Cron aufgerufen.
 * - Bei erstem Breach: blocker setzen, Stufe-1-Mahnung senden.
 * - Bei bereits breached und 3 WT vergangen: Stufe 2.
 * - Bei bereits breached und 7 WT vergangen: Stufe 3 (+ Eskalations-Task).
 */
export async function handleKanzleiBreach(slaRecord: SlaRecord): Promise<{
  stufe: MahnungsStufe | null
  blocker: BlockerInfo | null
}> {
  const db = createAdminClient()

  // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
  const { data: fall } = await db
    .from('faelle')
    // CMM-44 SP-I3: kuerzungs_betrag lebt auf kanzlei_faelle (1:1) — via Nested-Embed unter claims.
    .select('id, kanzlei_id, claims:claim_id(claim_nummer, kundenbetreuer_id, kanzlei_faelle(kuerzungs_betrag))')
    .eq('id', slaRecord.fall_id)
    .single()

  if (!fall) {
    console.warn(`[AAR-431] handleKanzleiBreach: Fall ${slaRecord.fall_id} nicht gefunden`)
    return { stufe: null, blocker: null }
  }

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  // CMM-44 SP-I3: kuerzungs_betrag aus dem kanzlei_faelle-Embed (1:1, Array-normalisiert).
  const fallKf = Array.isArray((fallClaim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle)
    ? (fallClaim as { kanzlei_faelle: unknown[] }).kanzlei_faelle[0]
    : (fallClaim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle

  const fallKtx: FallKontext = {
    id: fall.id as string,
    claim_nummer: (fallClaim?.claim_nummer as string | null) ?? null,
    kanzlei_id: (fall.kanzlei_id as string | null) ?? null,
    kundenbetreuer_id: (fallClaim?.kundenbetreuer_id as string | null) ?? null,
    kuerzungs_betrag: ((fallKf as { kuerzungs_betrag?: number | null } | null)?.kuerzungs_betrag) ?? null,
  }

  const aktuellerStand = slaRecord.n_mahnungen ?? 0

  // ─── Stufe bestimmen ────────────────────────────────────────────────
  let stufe: MahnungsStufe | null = null

  if (aktuellerStand === 0) {
    stufe = 1
  } else {
    const letzte = slaRecord.letzte_mahnung_am ? new Date(slaRecord.letzte_mahnung_am) : null
    if (!letzte) return { stufe: null, blocker: null }
    const wtSeitLetzter = workingDaysBetween(letzte, new Date())
    if (aktuellerStand === 1 && wtSeitLetzter >= 3) stufe = 2
    else if (aktuellerStand === 2 && wtSeitLetzter >= 7) stufe = 3
  }

  if (!stufe) return { stufe: null, blocker: null }

  // Blocker ermitteln und auf SLA-Record speichern (nur bei Stufe 1)
  let blocker: BlockerInfo
  if (stufe === 1) {
    blocker = await detectBlocker(fallKtx.id, slaRecord.sla_typ)
    await db
      .from('sla_tracking')
      .update({
        status: 'breached',
        blocker_rolle: blocker.rolle,
        blocker_grund: blocker.grund,
      })
      .eq('id', slaRecord.id)
  } else {
    blocker = {
      rolle: (slaRecord.blocker_rolle as BlockerInfo['rolle']) ?? 'kanzlei',
      grund: slaRecord.blocker_grund ?? 'Unbekannt',
    }
  }

  // ─── Mahnung je nach Blocker ────────────────────────────────────────
  if (blocker.rolle === 'kanzlei') {
    await sendKanzleiMahnung(fallKtx, slaRecord.sla_typ, stufe)
    await createKbNachfassTask(fallKtx, 'kanzlei-nachfassen', slaRecord, stufe === 3 ? 'kritisch' : 'dringend')
  } else if (blocker.rolle === 'kunde') {
    await sendKundenReminderWegenKanzlei(fallKtx, slaRecord.sla_typ)
    await createKbNachfassTask(fallKtx, 'kunde-erinnern-fuer-kanzlei', slaRecord, stufe === 3 ? 'kritisch' : 'dringend')
  } else if (blocker.rolle === 'sv') {
    await createKbNachfassTask(fallKtx, 'sv-nachfassen-fuer-kanzlei', slaRecord, stufe === 3 ? 'kritisch' : 'dringend')
  }

  // Stufe 3 → zusätzlicher KB-Eskalations-Task „Kanzlei-Wechsel prüfen"
  if (stufe === 3 && blocker.rolle === 'kanzlei') {
    await createAutoTask({
      fall_id: fallKtx.id,
      empfaenger_id: fallKtx.kundenbetreuer_id ?? null,
      empfaenger_rolle: 'kundenbetreuer',
      task_typ: 'kanzlei-wechsel-pruefen',
      titel: `Kanzlei-Wechsel prüfen — Fall ${fallKtx.claim_nummer ?? fallKtx.id.slice(0, 8)}`,
      beschreibung: `3. Mahnung erfolglos (SLA ${slaRecord.sla_typ}). Bitte Kanzlei-Wechsel evaluieren.`,
      deadline: addWorkingDays(new Date(), 2),
      prioritaet: 'kritisch',
    })
  }

  // Counter updaten
  await db
    .from('sla_tracking')
    .update({
      n_mahnungen: stufe,
      letzte_mahnung_am: new Date().toISOString(),
    })
    .eq('id', slaRecord.id)

  return { stufe, blocker }
}
