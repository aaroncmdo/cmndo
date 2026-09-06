'use client'

// Kasko-Claim mit UNGEKLAERTER Werkstattbindung (freie_werkstattwahl NULL, quelle 'unbekannt'): der Kunde hat
// „Ich kann das gerade nicht prüfen" gewählt (E3: durchlassen, Dispatch klaert). Bisher gab es dafuer im Portal nur
// den Toast — nach einem Reload war nichts mehr zu sehen (Gegenabnahme 05.09.). Soll-Blatt Regel 6:
// memory/abnahmen/2026-09-05-kasko-pruefhinweis-card-portal.md — Card oberhalb des Finders, drei Saetze
// (was wir pruefen, was du tun kannst, was passiert), zwei Handlungen (Angaben korrigieren, Dokumente), du-Anrede;
// der Finder bleibt sichtbar (A1). Verschwindet nach eigener Korrektur oder Dispatch-Override (Flags aus dem Claim).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSearchIcon } from 'lucide-react'
import { Button, Card } from '@/components/primitives'
import KaskoTarifCard from '@/components/kunde/KaskoTarifCard'

export default function KaskoPruefungCard({ claimId, dokumenteZielId = 'doks-termine' }: { claimId: string; dokumenteZielId?: string }) {
  const router = useRouter()
  const [korrigieren, setKorrigieren] = useState(false)
  if (korrigieren) {
    return (
      <KaskoTarifCard
        claimId={claimId}
        onGespeichert={() => {
          // Frei/gebunden: GeldZone blendet die Pruef-Card nach dem Refresh aus; unbekannt: sie bleibt.
          setKorrigieren(false)
          router.refresh()
        }}
      />
    )
  }
  return (
    <Card p={5} radius="lg" accentColor="warning" data-testid="kasko-pruefung-card">
      <div className="mb-2 flex items-center gap-2">
        <FileSearchIcon className="h-5 w-5 text-warning-strong" aria-hidden />
        <h2 className="text-heading-sm text-claimondo-navy">Ihr Versicherungsschein wird geprüft</h2>
      </div>
      <p className="text-body-sm text-claimondo-navy/80">
        Sie konnten die Werkstattbindung Ihres Kasko-Tarifs noch nicht angeben. Unser Team klärt mit Ihnen, ob Ihre
        Versicherung die Werkstatt vorschreibt, bevor eine Reparatur beauftragt wird. Halten Sie dafür bitte Ihren
        Versicherungsschein bereit oder lade ihn unter „Dokumente" hoch.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setKorrigieren(true)}>
          <span data-testid="kasko-pruefung-korrigieren">Angaben korrigieren</span>
        </Button>
        <Button
          variant="bare"
          size="sm"
          onClick={() => document.getElementById(dokumenteZielId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span data-testid="kasko-pruefung-dokumente">Zu den Dokumenten</span>
        </Button>
      </div>
    </Card>
  )
}
