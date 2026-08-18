import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SV-LevelUp — Sichtbarkeits-Check für Kfz-Sachverständige',
  description:
    'Messen, wo Sie im Feld stehen: Google-Profil, Website, Wettbewerb und Nachfrage in Ihrem Gebiet — mit Quelle und Datum an jeder Zahl.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
