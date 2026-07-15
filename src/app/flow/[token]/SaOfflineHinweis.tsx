'use client'

// Slice 2-write-3: Die verbindliche Beauftragung (signSAandCreateFall erstellt den Fall +
// braucht die fallId sofort für Account-Anlage/PDF) ist online-only — kein sinnvoller
// Offline-Zweig. Statt eines kaputten Sign-Versuchs offline ein Hinweis; die bisher offline
// erfassten Angaben liegen in der Outbox und syncen beim Reconnect.
export default function SaOfflineHinweis() {
  return (
    <div className="rounded-ios-xl border border-warning/30 bg-warning-soft p-4 text-center space-y-2">
      <p className="text-body-sm font-medium text-warning-strong">Beauftragung benötigt Internet</p>
      <p className="text-body-xs text-warning-strong">
        Der letzte Schritt — die verbindliche Beauftragung — benötigt eine Internetverbindung. Ihre bisherigen
        Angaben sind gespeichert und werden synchronisiert, sobald Sie wieder online sind.
      </p>
    </div>
  )
}
