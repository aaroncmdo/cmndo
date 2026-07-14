'use client'
import { Button } from '@/components/primitives/Button/Button.web'

// Slice 2-write-1: Terminbuchung braucht Live-Slots vom Server (kein sinnvoller
// Offline-Zweig). Statt eines harten Fehlers offline: Angaben sind lokal
// gespeichert (Outbox), Nutzer kann ohne Termin fortfahren und den Termin
// spaeter online vereinbaren.
export default function TerminOfflineHinweis({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="rounded-ios-xl border border-warning/30 bg-warning-soft p-4 text-center space-y-3">
      <p className="text-body-sm text-warning-strong">
        Terminbuchung ist nur mit Internetverbindung möglich. Ihre Angaben sind gespeichert — Sie können den Termin
        gleich vereinbaren, sobald Sie wieder online sind.
      </p>
      <Button variant="ondo" size="md" onClick={onSkip} className="w-full">
        Ohne Termin fortfahren
      </Button>
    </div>
  )
}
