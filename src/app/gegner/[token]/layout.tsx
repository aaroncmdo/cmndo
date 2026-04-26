import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Unfallbeteiligung — Claimondo',
  description: 'Ihre Daten zum Schadensfall',
  robots: { index: false, follow: false },
}

export default function GegnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8f9fb' }}>
      {children}
    </div>
  )
}
