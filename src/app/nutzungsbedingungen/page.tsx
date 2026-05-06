import type { Metadata } from 'next'
import LegalDocPage from '@/components/legal/LegalDocPage'

export const metadata: Metadata = {
  title: 'Nutzungsbedingungen | Claimondo',
}

export default function NutzungsbedingungenPage() {
  return <LegalDocPage slug="nutzungsbedingungen" />
}
