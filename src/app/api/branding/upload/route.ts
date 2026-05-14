// AAR-422: POST /api/branding/upload
//
// Nimmt eine multipart/form-data-File, lädt sie in den gutachter-logos-
// Bucket (AAR-218) via Admin-Client und returned die Public-URL. Die UI ruft
// direkt danach /api/branding/extract auf um die Palette zu generieren.
//
// Authorized: Nur der SV selbst darf in seinen eigenen Pfad laden. Bei Büro-
// Inhabern (ist_parent_account) wird zusätzlich der org-Pfad unterstützt.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/avif'])
const MAX_BYTES = 2 * 1024 * 1024

export async function POST(req: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, organisation_id, ist_parent_account')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!sv) return NextResponse.json({ error: 'Kein SV-Profil' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('logo')
  const scope = form.get('scope') // 'sv' | 'org'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'logo muss eine Datei sein' }, { status: 400 })
  }
  if (file.size === 0) return NextResponse.json({ error: 'Leere Datei' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Datei zu groß — max 2 MB' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Nur PNG, JPG, SVG oder WebP erlaubt' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()

  // 2026-05-14: Server-seitiger BG-Remove-Fallback (siehe server-bg-remove.ts).
  // imgly (Client) ist auf Foto-Segmentierung trainiert und versagt bei Text-
  // Logos auf solidem Background. Sharp-Chroma-Key übernimmt den klassischen
  // Logo-auf-weiß/schwarz-Fall deterministisch.
  let uploadBuffer: Buffer | File = file
  let uploadContentType = file.type
  let uploadExt = ext
  if (file.type !== 'image/svg+xml') {
    try {
      const { stripSolidBackground } = await import('@/lib/branding/server-bg-remove')
      const srcBuffer = Buffer.from(await file.arrayBuffer())
      const result = await stripSolidBackground(srcBuffer)
      uploadBuffer = result.cleaned
      uploadContentType = result.contentType
      uploadExt = result.ext
      if (result.applied && result.bgColor) {
        console.info(
          `[branding/upload] chroma-key applied — BG rgb(${result.bgColor.r},${result.bgColor.g},${result.bgColor.b})`,
        )
      } else {
        console.info(
          `[branding/upload] chroma-key skipped — kein uniform-near-white/black/light BG erkannt (Logo durchgereicht)`,
        )
      }
    } catch (err) {
      console.warn('[branding/upload] sharp post-process übersprungen:', err)
    }
  }

  // Pfad-Entscheidung: Büro-Inhaber können explizit auf org-Pfad speichern,
  // sonst immer SV-Pfad. Sub-SVs erben automatisch über das Org-Lookup.
  const useOrgPath = scope === 'org' && sv.ist_parent_account && sv.organisation_id
  const path = useOrgPath
    ? `org/${sv.organisation_id}/${Date.now()}.${uploadExt}`
    : `${sv.id}/${Date.now()}.${uploadExt}`

  const db = createAdminClient()
  const { error: uploadErr } = await db.storage
    .from('gutachter-logos')
    .upload(path, uploadBuffer, { contentType: uploadContentType, upsert: true })
  if (uploadErr) {
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: urlData } = db.storage.from('gutachter-logos').getPublicUrl(path)
  return NextResponse.json({
    logoUrl: urlData.publicUrl,
    scope: useOrgPath ? 'org' : 'sv',
  })
}
