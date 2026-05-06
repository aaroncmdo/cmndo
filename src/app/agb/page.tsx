import type { Metadata } from 'next'
import LegalDocPage from '@/components/legal/LegalDocPage'

export const metadata: Metadata = {
  title: 'Allgemeine Geschäftsbedingungen | Claimondo',
}

export default function AGBPage() {
  return <LegalDocPage slug="agb" />
}
