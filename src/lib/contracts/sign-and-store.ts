'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { generateContractPdf, type ContractPdfData } from './contract-pdf'

type SignContext = {
  vorlage_typ: string                   // 'nutzungsbedingungen' | 'kooperationsvertrag_buero' | ...
  unterschrift_name: string             // Name der unterschreibenden Person
  unterschrift_ip?: string | null
  unterschrift_user_agent?: string | null
  // PNG-Data-URI aus signature_pad: padRef.current.toDataURL('image/png')
  // Wird direkt ins PDF eingebrannt. Wenn null/undefined: PDF zeigt Linie + Name.
  signature_png_data_uri?: string | null
  // Genau eines der beiden:
  sv_id?: string | null
  organisation_id?: string | null
  // Optional fuer PDF-Header
  rolle?: string                        // 'Solo-Sachverstaendiger' | 'Buero-Inhaber'
  organisation_name?: string
}

type SignResult = {
  vertrag_id: string
  pdf_path: string
  pdf_buffer: Buffer
  vorlage_titel: string
  vorlage_version: string
}

/**
 * KFZ-148/152: Vertrag unterzeichnen, PDF generieren, in vertraege Bucket
 * speichern, vertraege_unterzeichnet-Eintrag schreiben.
 *
 * Caller-Verantwortung: Aufruf nur nach Auth + Eingabe-Validierung.
 * Email-Versand mit dem Buffer macht der Caller (siehe sendContractEmail).
 */
export async function signAndStoreContract(ctx: SignContext): Promise<SignResult> {
  if (!ctx.sv_id && !ctx.organisation_id) {
    throw new Error('signAndStoreContract: sv_id oder organisation_id muss gesetzt sein')
  }

  const db = createAdminClient()

  // 1. Aktive Vertragsvorlage laden
  const { data: vorlage, error: vorlageErr } = await db.from('vertragsvorlagen')
    .select('id, version, titel, inhalt_html')
    .eq('typ', ctx.vorlage_typ)
    .eq('aktiv', true)
    .limit(1)
    .single()
  if (vorlageErr || !vorlage) {
    throw new Error(`Keine aktive Vertragsvorlage fuer typ='${ctx.vorlage_typ}' gefunden`)
  }

  // 2. vertraege_unterzeichnet-Eintrag (ohne pdf_storage_path — wird gleich nachgezogen)
  const { data: vertrag, error: vertragErr } = await db.from('vertraege_unterzeichnet').insert({
    sv_id: ctx.sv_id ?? null,
    organisation_id: ctx.organisation_id ?? null,
    vorlage_id: vorlage.id,
    vorlage_typ: ctx.vorlage_typ,
    vorlage_version: vorlage.version,
    unterschrift_name: ctx.unterschrift_name,
    unterschrift_ip: ctx.unterschrift_ip ?? null,
    unterschrift_user_agent: ctx.unterschrift_user_agent ?? null,
  }).select('id').single()
  if (vertragErr || !vertrag) {
    throw new Error(`vertraege_unterzeichnet insert fehlgeschlagen: ${vertragErr?.message}`)
  }

  // 3. PDF generieren — react-pdf <Image> embedded das PNG data URI direkt
  const pdfData: ContractPdfData = {
    vorlage_typ: ctx.vorlage_typ,
    vorlage_titel: vorlage.titel ?? ctx.vorlage_typ,
    vorlage_version: vorlage.version,
    inhalt_html: vorlage.inhalt_html ?? '',
    unterzeichner_name: ctx.unterschrift_name,
    unterzeichner_rolle: ctx.rolle,
    unterzeichner_organisation: ctx.organisation_name,
    unterschrift_datum: new Date(),
    unterschrift_ip: ctx.unterschrift_ip ?? null,
    signature_png_data_uri: ctx.signature_png_data_uri ?? null,
  }
  const pdfBuffer = await generateContractPdf(pdfData)

  // 4. Storage-Upload nach vertraege/<sv_id>/<id>.pdf
  //    bzw. vertraege/orgs/<organisation_id>/<id>.pdf
  const pathSegment = ctx.sv_id
    ? `${ctx.sv_id}/${vertrag.id}.pdf`
    : `orgs/${ctx.organisation_id}/${vertrag.id}.pdf`

  const { error: uploadErr } = await db.storage
    .from('vertraege')
    .upload(pathSegment, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadErr) {
    throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`)
  }

  // 5. pdf_storage_path + pdf_generiert_am nachziehen (AAR-401)
  await db.from('vertraege_unterzeichnet')
    .update({
      pdf_storage_path: pathSegment,
      pdf_generiert_am: new Date().toISOString(),
    })
    .eq('id', vertrag.id)

  return {
    vertrag_id: vertrag.id,
    pdf_path: pathSegment,
    pdf_buffer: pdfBuffer,
    vorlage_titel: vorlage.titel ?? ctx.vorlage_typ,
    vorlage_version: vorlage.version,
  }
}
