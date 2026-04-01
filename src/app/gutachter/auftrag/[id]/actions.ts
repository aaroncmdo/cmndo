'use server'

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { emailGutachtenEingegangen } from '@/lib/email'

export async function uploadGutachten(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('datei') as File
  const betrag = parseFloat(formData.get('betrag') as string)

  if (!file || file.size === 0) throw new Error('Bitte eine PDF-Datei auswählen')
  if (isNaN(betrag) || betrag <= 0) throw new Error('Bitte einen gültigen Betrag eingeben')
  if (file.type !== 'application/pdf') throw new Error('Nur PDF-Dateien sind erlaubt')

  // Verify the case belongs to this gutachter
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) throw new Error('Kein Sachverständigen-Profil gefunden')

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()

  if (!fall) throw new Error('Auftrag nicht gefunden')

  // Upload PDF to storage
  const timestamp = Date.now()
  const filePath = `gutachten/${fallId}/${timestamp}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('dokumente')
    .upload(filePath, file)

  if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('dokumente')
    .getPublicUrl(filePath)

  // Create document record
  const { error: docError } = await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: 'gutachten',
    datei_url: urlData.publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
  })

  if (docError) throw new Error(`Dokument-Eintrag fehlgeschlagen: ${docError.message}`)

  // Update case status and gutachten data
  const { error: updateError } = await supabase
    .from('faelle')
    .update({
      status: 'gutachten-eingegangen',
      gutachten_eingegangen_am: new Date().toISOString(),
      gutachten_betrag: betrag,
    })
    .eq('id', fallId)

  if (updateError) throw new Error(`Status-Update fehlgeschlagen: ${updateError.message}`)

  // E-Mail an Admin: Gutachten eingegangen
  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer').eq('id', fallId).single()
  const { data: admins } = await supabase.from('profiles').select('email').eq('rolle', 'admin')
  const fallNr = fallInfo?.fall_nummer ?? fallId.slice(0, 8)
  for (const admin of admins ?? []) {
    if (admin.email) emailGutachtenEingegangen(admin.email, fallNr).catch(() => {})
  }

  revalidatePath(`/gutachter/auftrag/${fallId}`)
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter')
}
