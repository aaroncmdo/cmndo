// 3a (dispatch-config-unify, Paritaet 3/3): SA-Konversions-Banner fuer den flachen
// v2-Form. Portiert aus der Legacy-DispatchShell: sobald der Lead zu einem Fall
// konvertiert ist (sa_unterschrieben), ist der Lead-Edit serverseitig gesperrt
// (saveDispatchLeadFelder + saveStammdaten blocken — AAR-631). Der Banner erklaert
// dem Dispatcher, dass Stammdaten-Aenderungen ab jetzt ueber die Fallakte laufen,
// und verlinkt die Fallakte (wenn der Fall geladen werden konnte).
//
// Render-Regel: Banner sobald sa_unterschrieben (erklaert den Edit-Lock); der
// Fallakte-Link nur wenn fallId vorhanden ist (Fall existiert + ladbar). Damit ist
// der Banner auch im Edge-Case "SA unterschrieben, Fall noch nicht ladbar" sichtbar
// (statt wie in der Legacy-Shell komplett zu fehlen) — der Edit-Lock greift dort
// serverseitig trotzdem.

import Link from 'next/link'

export function DispatchSaBanner({
  saUnterschrieben,
  fallId,
}: {
  saUnterschrieben: boolean
  fallId: string | null
}) {
  if (!saUnterschrieben) return null

  return (
    <div className="mb-4 max-w-3xl rounded-ios-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <span className="text-amber-600 text-lg leading-none mt-0.5">ℹ</span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-amber-900">Lead ist konvertiert</p>
        <p className="text-amber-800 mt-0.5">
          Stammdaten-Änderungen jetzt in der Fallakte machen — Lead-Daten sind als
          Snapshot eingefroren.
        </p>
        {fallId && (
          <Link
            href={`/faelle/${fallId}`}
            className="inline-block mt-2 text-claimondo-ondo hover:underline font-medium"
          >
            Zur Fallakte →
          </Link>
        )}
      </div>
    </div>
  )
}
