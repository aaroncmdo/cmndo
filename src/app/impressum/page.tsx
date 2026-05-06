import type { Metadata } from 'next'
import LegalDocPage from '@/components/legal/LegalDocPage'

export const metadata: Metadata = {
  title: 'Impressum | Claimondo',
}

export default function ImpressumPage() {
  return <LegalDocPage slug="impressum" />
}
