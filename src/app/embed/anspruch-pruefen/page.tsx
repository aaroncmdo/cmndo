import type { Metadata } from 'next'
import { AnspruchWizard } from './_components/AnspruchWizard'

export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Anspruch prüfen' }

export default function AnspruchPruefenPage() {
  return (
    <main className="min-h-screen bg-claimondo-bg">
      <AnspruchWizard />
    </main>
  )
}
