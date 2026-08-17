// AAR-939 (Baileys Task C): Bytes-neutraler Medien-Prozessor.
// Portiert die Media-Routing-Logik aus dem Twilio-Inbound-Webhook in ein
// provider-agnostisches Lib-Modul. Bytes kommen vom Caller (bereits aufgeloest),
// kein Twilio-Fetch hier — testbar + kein Rework wenn Baileys-Worker-Contract
// sich aendert.
//
// KEIN 'use server' — wird von API-Routen aufgerufen.

import type { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getStorageUrl } from '@/lib/storage/url'
import { sendCommunication } from '@/lib/communications/send'
import { scheduleBkatAnalyseAfterUpload } from '@/lib/bkat/auto-trigger'
import { runZB1Ocr } from '@/lib/ocr/zb1-parser'

// ─── syncDokumentUploadAnfrage (lokale Kopie) ─────────────────────────────────
// Transitional-Duplikat des gleichen Helpers im Twilio-Route.
// Entfernt sobald der Twilio-Route-Cutover-PR (Abloesung von
// /api/webhooks/twilio/inbound) diesen Helper zentralisiert.

type AnfrageSlot = {
  slot_id: 'fahrzeugschein' | 'polizeibericht' | 'sonstiges'
  label: string
  ocr: boolean
  hochgeladen: boolean
  doc_url: string | null
  hochgeladen_am: string | null
}

async function syncDokumentUploadAnfrage(
  db: ReturnType<typeof createAdminClient>,
  leadId: string,
  slotId: AnfrageSlot['slot_id'],
  publicUrl: string,
): Promise<void> {
  try {
    const { data: anfragen } = await db
      .from('dokument_upload_anfragen')
      .select('id, slots, status, expires_at')
      .eq('lead_id', leadId)
      .in('status', ['gesendet', 'teilweise'])
      .order('erstellt_am', { ascending: false })
      .limit(5)
    if (!anfragen || anfragen.length === 0) return
    const now = Date.now()
    const offene = anfragen.filter((a) => {
      if (!a.expires_at) return true
      return new Date(a.expires_at as string).getTime() >= now
    })
    for (const a of offene) {
      const slots = (a.slots as AnfrageSlot[]) ?? []
      const idx = slots.findIndex((s) => s.slot_id === slotId && !s.hochgeladen)
      if (idx === -1) continue
      const tsIso = new Date().toISOString()
      const updated = slots.map((s, i) =>
        i === idx ? { ...s, hochgeladen: true, doc_url: publicUrl, hochgeladen_am: tsIso } : s,
      )
      const alle = updated.every((s) => s.hochgeladen)
      await db.from('dokument_upload_anfragen').update({
        slots: updated,
        status: alle ? 'komplett' : 'teilweise',
        updated_at: tsIso,
      }).eq('id', a.id as string)
      return  // Nur die erste passende Anfrage aktualisieren
    }
  } catch (err) {
    console.warn('[syncDokumentUploadAnfrage] fehlgeschlagen:', err instanceof Error ? err.message : err)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type InboundMediaFile = {
  buffer: Buffer
  mime: string
  filename?: string
}

/**
 * Verarbeitet eingegangene Media-Dateien aus einer eingehenden WhatsApp-Nachricht.
 * Bytes muessen vom Caller bereits aufgeloest worden sein (provider-neutral).
 *
 * Routing-Reihenfolge (identisch zum Twilio-Webhook):
 *  1. Lead + kein Fall  → ZB1 / Polizeibericht / Mehrfachbild-Fallback
 *  2. Fall vorhanden    → fall_dokumente-Insert + Kundenbetreuer-Notification
 */
export async function processInboundMedia(
  db: ReturnType<typeof createAdminClient>,
  args: {
    fromPhone: string
    leadId: string | null
    fallId: string | null
    mediaFiles: InboundMediaFile[]
  },
): Promise<{ handled: boolean }> {
  const { fromPhone, leadId, fallId, mediaFiles } = args

  if (mediaFiles.length === 0) {
    return { handled: false }
  }

  // ─── 1) Lead-Pfad (kein Fall) ──────────────────────────────────────────────
  if (leadId && !fallId) {
    try {
      const { data: leadRow } = await db
        .from('leads')
        .select('id, vorname, nachname, zb1_status, zb1_gesendet_am, polizeibericht_status, polizeibericht_gesendet_am, polizei_aktenzeichen, zugewiesen_an')
        .eq('id', leadId)
        .single()

      // AAR-263: Prio-Logik — wenn beide Anfragen offen, nimm die JUENGERE.
      const zb1Open = leadRow?.zb1_status === 'gesendet' || leadRow?.zb1_status === 'geoeffnet'
      const pbOpen = leadRow?.polizeibericht_status === 'gesendet' || leadRow?.polizeibericht_status === 'geoeffnet'
      let route: 'zb1' | 'polizeibericht' | null = null
      if (zb1Open && pbOpen) {
        const zb1Ts = leadRow?.zb1_gesendet_am ? new Date(leadRow.zb1_gesendet_am).getTime() : 0
        const pbTs = leadRow?.polizeibericht_gesendet_am ? new Date(leadRow.polizeibericht_gesendet_am).getTime() : 0
        route = pbTs > zb1Ts ? 'polizeibericht' : 'zb1'
      } else if (zb1Open) {
        route = 'zb1'
      } else if (pbOpen) {
        route = 'polizeibericht'
      }

      // Mehrfachbild-Fallback: beide bereits hochgeladen, weiteres Foto kommt rein
      if (
        !route &&
        (leadRow?.zb1_status === 'hochgeladen' || leadRow?.polizeibericht_status === 'hochgeladen')
      ) {
        const savedPaths: string[] = []
        for (let i = 0; i < mediaFiles.length; i++) {
          const { buffer, mime } = mediaFiles[i]
          const ext = mimeToExt(mime)
          const ts = Date.now()
          const path = `leads/${leadId}/zusatz_${ts}_${i}.${ext}`
          const { error: upErr } = await db.storage
            .from('fall-dokumente')
            .upload(path, buffer, { contentType: mime, upsert: false })
          if (!upErr) savedPaths.push(path)
        }
        if (savedPaths.length > 0 && leadRow?.zugewiesen_an) {
          try {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(
              leadRow.zugewiesen_an,
              'lead-zusatz-foto',
              `Zusatz-Foto vom Lead: ${leadRow.vorname ?? ''} ${leadRow.nachname ?? ''}`.trim(),
              `${savedPaths.length} weitere(s) Foto(s) per WhatsApp eingegangen — bitte prüfen und manuell zuordnen.`,
              `/dispatch/leads/${leadId}`,
            ).catch(() => {})
          } catch { /* non-critical */ }
        }
        return { handled: true }
      }

      // Polizeibericht-Pfad
      if (route === 'polizeibericht') {
        const firstImageFile = mediaFiles.find((f) => f.mime.startsWith('image/')) ?? mediaFiles[0]
        const { buffer, mime } = firstImageFile
        const ext = mimeToExt(mime)
        const ts = Date.now()
        const path = `leads/${leadId}/polizeibericht_${ts}.${ext}`
        const { error: upErr } = await db.storage
          .from('fall-dokumente')
          .upload(path, buffer, { contentType: mime, upsert: false })
        if (upErr) {
          const { error: pbFehlStatus } = await db.from('leads').update({
            polizeibericht_status: 'fehlgeschlagen',
            updated_at: new Date().toISOString(),
          }).eq('id', leadId)
          if (pbFehlStatus) {
            console.error('[process-inbound-media] Polizeibericht-Fehlstatus nicht gesetzt:', pbFehlStatus.message)
          }
          console.warn('[process-inbound-media] Polizeibericht Storage-Upload fehlgeschlagen:', upErr.message)
        } else {
          const publicUrl = await getStorageUrl(db, 'fall-dokumente', path)
          if (publicUrl) {
            // ERFOLGSPFAD: die Datei liegt bereits im Storage. Still fehlgeschlagen
            // heisst: der Kunde hat per WhatsApp geliefert und der Lead weiss nichts davon.
            const { error: pbOkStatus } = await db.from('leads').update({
              polizeibericht_status: 'hochgeladen',
              polizeibericht_url: publicUrl,
              polizeibericht_hochgeladen_am: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', leadId)
            if (pbOkStatus) {
              console.error(`[process-inbound-media] Polizeibericht NICHT am Lead vermerkt (${leadId}):`, pbOkStatus.message)
            }
            await syncDokumentUploadAnfrage(db, leadId, 'polizeibericht', publicUrl)
            scheduleBkatAnalyseAfterUpload(db, leadId, publicUrl)
          } else {
            console.warn('[process-inbound-media] Polizeibericht URL-Generierung fehlgeschlagen')
          }
        }

        await sendCommunication('chat_fallback_kunde', {
          telefon: fromPhone,
          '1': '',
          '2': 'Danke! Die polizeiliche Unfallmitteilung ist angekommen — der Dispatcher meldet sich.',
        }).catch(() => {})

        if (leadRow?.zugewiesen_an) {
          try {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(
              leadRow.zugewiesen_an,
              'polizeibericht-hochgeladen',
              `Polizeibericht eingegangen: ${leadRow.vorname ?? 'Lead'} ${leadRow.nachname ?? ''}`.trim(),
              'Polizeiliche Unfallmitteilung wurde per WhatsApp eingereicht.',
              `/dispatch/leads/${leadId}`,
            )
          } catch { /* non-critical */ }
        }

        return { handled: true }
      }

      // ZB1-Pfad
      if (route === 'zb1') {
        const firstImageFile = mediaFiles.find((f) => f.mime.startsWith('image/')) ?? mediaFiles[0]
        const { buffer, mime } = firstImageFile
        const ext = mimeToExt(mime)
        const ts = Date.now()
        const path = `leads/${leadId}/zb1_${ts}.${ext}`
        const { error: upErr } = await db.storage
          .from('fall-dokumente')
          .upload(path, buffer, { contentType: mime, upsert: false })
        if (upErr) {
          console.warn('[process-inbound-media] ZB1 Storage-Upload fehlgeschlagen:', upErr.message)
        } else {
          const publicUrl = await getStorageUrl(db, 'fall-dokumente', path)
          if (publicUrl) {
            const ocrResult = await runZB1Ocr(buffer.toString('base64'))
            if ('error' in ocrResult) {
              const { error: zb1FehlStatus } = await db.from('leads').update({
                zb1_status: 'fehlgeschlagen',
                zb1_url: publicUrl,
                updated_at: new Date().toISOString(),
              }).eq('id', leadId)
              if (zb1FehlStatus) {
                console.error('[process-inbound-media] ZB1-Fehlstatus nicht gesetzt:', zb1FehlStatus.message)
              }
            } else {
              const { fullText, extracted } = ocrResult
              const leadUpdate: Record<string, unknown> = {
                zb1_status: 'hochgeladen',
                zb1_url: publicUrl,
                zb1_hochgeladen_am: new Date().toISOString(),
                zb1_ocr_daten: { raw_text: fullText, extracted, ts: new Date().toISOString() },
                updated_at: new Date().toISOString(),
              }
              // AAR-208: 'fin' auf leads (nicht 'fin_vin' — das ist faelle)
              if (extracted.fin_vin) leadUpdate.fin = extracted.fin_vin
              if (extracted.kennzeichen) leadUpdate.kennzeichen = extracted.kennzeichen
              if (extracted.fahrzeug_hersteller) leadUpdate.fahrzeug_hersteller = extracted.fahrzeug_hersteller
              if (extracted.fahrzeug_modell) leadUpdate.fahrzeug_modell = extracted.fahrzeug_modell
              if (extracted.fahrzeug_baujahr != null) leadUpdate.fahrzeug_baujahr = extracted.fahrzeug_baujahr
              if (extracted.erstzulassung) leadUpdate.erstzulassung = extracted.erstzulassung
              if (extracted.halter_vorname) leadUpdate.halter_vorname = extracted.halter_vorname
              if (extracted.halter_nachname) leadUpdate.halter_nachname = extracted.halter_nachname
              if (extracted.halter_strasse) leadUpdate.halter_strasse = extracted.halter_strasse
              if (extracted.halter_plz) leadUpdate.halter_plz = extracted.halter_plz
              if (extracted.halter_stadt) leadUpdate.halter_stadt = extracted.halter_stadt
              if (extracted.hsn) leadUpdate.hsn = extracted.hsn
              if (extracted.tsn) leadUpdate.tsn = extracted.tsn
              // ERFOLGSPFAD: die ausgelesenen Fahrzeugschein-Daten. Still fehlgeschlagen
              // heisst: OCR lief, Bild liegt da, Felder fehlen.
              const { error: zb1DatenFehler } = await db.from('leads').update(leadUpdate).eq('id', leadId)
              if (zb1DatenFehler) {
                console.error(`[process-inbound-media] ZB1-Daten NICHT im Lead (${leadId}):`, zb1DatenFehler.message)
              }
              await syncDokumentUploadAnfrage(db, leadId, 'fahrzeugschein', publicUrl)
              // Cardentity-Enrich feuert NICHT mehr automatisch (kostenpflichtig)
              // — manueller Abruf ueber den Cardentity-Button (2026-05-31).
            }
          } else {
            console.warn('[process-inbound-media] ZB1 URL-Generierung fehlgeschlagen')
          }
        }

        await sendCommunication('chat_fallback_kunde', {
          telefon: fromPhone,
          '1': '',
          '2': 'Danke! Ihr Fahrzeugschein ist angekommen — wir lesen die Daten aus und der Dispatcher meldet sich.',
        }).catch(() => {})

        if (leadRow?.zugewiesen_an) {
          try {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(
              leadRow.zugewiesen_an,
              'zb1-hochgeladen',
              `Fahrzeugschein eingegangen: ${leadRow.vorname ?? 'Lead'}`,
              'ZB1-Foto wurde OCR-ausgelesen, Fahrzeugdaten sind gefüllt.',
              `/dispatch/leads/${leadId}`,
            )
          } catch { /* non-critical */ }
        }

        return { handled: true }
      }
    } catch (err) {
      console.error('[process-inbound-media] Lead-Pfad Fehler:', err instanceof Error ? err.message : err)
    }
  }

  // ─── 2) Fall-Pfad ──────────────────────────────────────────────────────────
  if (fallId) {
    const gespeichert: string[] = []
    const ts = Date.now()
    for (let i = 0; i < mediaFiles.length; i++) {
      const { buffer, mime, filename } = mediaFiles[i]
      const ext = mimeToExt(mime)
      const path = `${fallId}/wa_${ts}_${i}.${ext}`
      try {
        const { error: upErr } = await db.storage
          .from('fall-dokumente')
          .upload(path, buffer, { contentType: mime, upsert: false })
        if (upErr) {
          console.warn('[process-inbound-media] Fall Storage-Upload fehlgeschlagen:', upErr.message)
          continue
        }
        const kategorie = mime.startsWith('image/') ? 'whatsapp-foto' : 'kundendokument'
        const zeitStr = new Date(ts).toLocaleString('de-DE', {
          timeZone: 'Europe/Berlin',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        // Die Datei liegt im Storage. Scheitert dieser Insert still, existiert sie
        // physisch, aber fuer die Akte gar nicht — der Kunde hat geliefert, niemand sieht es.
        const { error: waDokFehler } = await db.from('fall_dokumente').insert({
          fall_id: fallId,
          dokument_typ: mime.startsWith('image/') ? 'whatsapp-foto' : 'whatsapp-datei',
          kategorie,
          quelle: 'whatsapp',
          storage_path: path,
          original_filename: filename ?? `WhatsApp ${zeitStr}.${ext}`,
          groesse_bytes: buffer.byteLength,
          mime_type: mime,
          uploaded_by_kunde: true,
          // AAR-263 Audit: kanzlei muss sichtbar sein fuer die Regulierung
          sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
          beschreibung: 'Via WhatsApp eingegangen',
        })
        if (waDokFehler) {
          console.error(
            `[process-inbound-media] WhatsApp-Dokument NICHT in der Akte (fall ${fallId}, storage ${path}):`,
            waDokFehler.message,
          )
        }
        gespeichert.push(path)
      } catch (err) {
        console.error('[process-inbound-media] Fall Media-Verarbeitung Fehler:', err instanceof Error ? err.message : err)
      }
    }

    // CMM-49: kundenbetreuer_id + claim_nummer direkt aus claims (SSoT) via resolveClaimId.
    const mediaClaimId = await resolveClaimId(db, fallId)
    const { data: fallClaim } = mediaClaimId
      ? await db.from('claims').select('kundenbetreuer_id, claim_nummer').eq('id', mediaClaimId).maybeSingle()
      : { data: null }
    const fallKb = fallClaim?.kundenbetreuer_id as string | null | undefined

    if (fallKb && gespeichert.length > 0) {
      try {
        const { createNotification } = await import('@/lib/notifications')
        await createNotification(
          fallKb,
          'kunde-dokument-upload',
          `Kunde hat ${gespeichert.length} Dokument(e) gesendet: Fall ${fallClaim?.claim_nummer ?? fallId.slice(0, 8)}`,
          'Per WhatsApp eingegangen. Bitte prüfen.',
          `/faelle/${fallId}?tab=dokumente`,
        ).catch(() => {})
      } catch { /* non-critical */ }
    }

    try {
      await db.from('timeline').insert({
        fall_id: fallId,
        typ: 'whatsapp-inbound',
        titel: `${gespeichert.length} Datei(en) per WhatsApp empfangen`,
        beschreibung: gespeichert.length > 0
          ? `Abgelegt in Dokumente-Tab. ${mediaFiles.length - gespeichert.length} Datei(en) fehlgeschlagen.`
          : 'Download/Storage-Upload fehlgeschlagen — siehe Server-Log',
      })
    } catch { /* non-critical */ }

    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': `Vielen Dank! Wir haben ${gespeichert.length} Datei(en) erhalten.`,
    }).catch(() => {})

    return { handled: true }
  }

  return { handled: false }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'application/pdf': return 'pdf'
    case 'video/mp4': return 'mp4'
    default: return mime.split('/')[1] || 'jpg'
  }
}
