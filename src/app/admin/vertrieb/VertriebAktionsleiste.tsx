'use client'
// Vertrieb-Cockpit: kontextuelle Aktions-Leiste. Zeigt je aktiver Rolle-Pill x Lead/Partner
// die passenden Aktionen (P1: Deep-Links auf den Bestand; spaetere Phasen: Drawer-Overlays).
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { contextAktionen } from './_lib/context-aktionen'
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

export default function VertriebAktionsleiste({
  rolle,
  typ,
}: {
  rolle: VertriebRolle | 'alle'
  typ: VertriebTyp | 'alle'
}) {
  const router = useRouter()
  const aktionen = contextAktionen(rolle, typ)
  if (aktionen.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {aktionen.map((a) => (
        <Button
          key={a.key}
          variant={a.kind === 'anlegen' ? 'navy' : 'ghost'}
          size="sm"
          onClick={() => a.href && router.push(a.href)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  )
}
