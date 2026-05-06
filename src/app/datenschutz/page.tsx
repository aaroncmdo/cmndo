import type { Metadata } from 'next'
import LegalDocPage from '@/components/legal/LegalDocPage'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung | Claimondo',
}

export default function DatenschutzPage() {
  return <LegalDocPage slug="datenschutz" />
}
