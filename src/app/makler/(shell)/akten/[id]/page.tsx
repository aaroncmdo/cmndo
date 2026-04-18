// AAR-487 (M5): Makler-Akte-Detail — Server-Entry. Lädt den Fall + alle
// benötigten Relationen, signed URLs für Dokumente. Consent-Gate:
// Minimal-Consent → Redirect zur Akten-Liste mit Hinweis-Param.

import { notFound, redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerFallDetail,
  getDocumentSignedUrls,
} from '@/lib/makler/queries'
import { MaklerAkteDetail } from '@/components/makler/akte-detail/MaklerAkteDetail'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: 'overview' | 'timeline' | 'documents' | 'chat' | 'copilot'
  }>
}

export default async function MaklerAkteDetailPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params
  const { tab = 'overview' } = await searchParams

  const makler = await getCurrentMakler()
  if (!makler) return null

  const detail = await getMaklerFallDetail(makler.id, id)
  if (!detail) notFound()

  if (detail.consent_scope !== 'vollzugriff') {
    redirect(`/makler/akten?consent=minimal&fall=${id}`)
  }

  const signedUrls = await getDocumentSignedUrls(detail.documents)

  return (
    <MaklerAkteDetail
      detail={detail}
      signedUrls={signedUrls}
      initialTab={tab}
      makler={makler}
    />
  )
}
