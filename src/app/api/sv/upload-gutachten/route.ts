// CMM-32: Multi-File-Upload für Gutachten + Anhänge.
// Lädt eine Datei in den fall-dokumente-Bucket, schreibt eine Zeile auf
// fall_dokumente, und beim ersten Upload setzt auftraege.gutachten_url +
// status='gutachten'. Damit ist die Begutachtung vom SV abgegeben und der
// QC-Prozess kann starten (32e).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    if (!sv) return NextResponse.json({ error: 'no_sv' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const auftragId = formData.get('auftragId') as string | null
    const istHauptgutachten = (formData.get('istHauptgutachten') as string | null) === 'true'

    if (!file || !auftragId) {
      return NextResponse.json({ error: 'file + auftragId required' }, { status: 400 })
    }

    const db = createAdminClient()

    const { data: auftrag } = await db
      .from('auftraege')
      .select('id, fall_id, sv_id, gutachten_url, status')
      .eq('id', auftragId)
      .eq('sv_id', sv.id)
      .single()

    if (!auftrag) return NextResponse.json({ error: 'Auftrag nicht gefunden' }, { status: 404 })

    const buffer = new Uint8Array(await file.arrayBuffer())
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase()
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
    const storagePath = `auftrag/${auftragId}/${Date.now()}-${safeName}`

    const { error: uploadErr } = await db.storage
      .from('fall-dokumente')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadErr) {
      console.error('[upload-gutachten] Storage:', uploadErr.message)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: publicData } = db.storage.from('fall-dokumente').getPublicUrl(storagePath)
    const publicUrl = publicData.publicUrl

    // fall_dokumente-Eintrag (für Listen-Sicht & Kanzleipaket-Bündelung)
    await db.from('fall_dokumente').insert({
      fall_id: auftrag.fall_id,
      dokument_typ: istHauptgutachten ? 'gutachten' : 'gutachten_anlage',
      storage_path: storagePath,
      original_filename: file.name,
      groesse_bytes: file.size,
      kategorie: 'gutachten',
      quelle: 'sv-upload',
      sichtbar_fuer: ['kundenbetreuer', 'kanzlei', 'admin'],
      uploaded_by_sv: true,
      hochgeladen_am: new Date().toISOString(),
    })

    // Beim Hauptgutachten: gutachten_url + status='gutachten' setzen
    if (istHauptgutachten || (!auftrag.gutachten_url && ext === 'pdf')) {
      await db
        .from('auftraege')
        .update({ gutachten_url: publicUrl, status: 'gutachten' })
        .eq('id', auftragId)
    }

    return NextResponse.json({ ok: true, storagePath, publicUrl })
  } catch (err) {
    console.error('[upload-gutachten]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
