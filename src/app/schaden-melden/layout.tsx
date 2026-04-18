import type { Metadata } from 'next'

// AAR-467 C1: Layout für den Kunden-Flow. Flow-Pages werden nicht
// indexiert — Step-URLs sollen nicht in Google landen, nur die
// Landing /schaden-melden als Entry-Point.

export const metadata: Metadata = {
  title: 'Schaden melden — Claimondo',
  robots: { index: false, follow: false },
}

export default function SchadenMeldenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
