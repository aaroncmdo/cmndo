'use client'

// AAR-956 §3a / AAR-940: Geteilte Kasko-Endansicht — Eigenverschulden bzw.
// disqualifizierter Lead, kein Termin. Fairer Hinweis statt Sackgasse. Genutzt von
// /anfrage (SelbstQualiClient) UND /flow (FlowQualiStep + disqualifiziert-Gate).

export function KaskoEndansicht() {
  return (
    <div className="max-w-md text-center" data-testid="quali-abbruch">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Danke für Ihre Angaben</h1>
      <p className="text-claimondo-navy/80 mb-2">
        Bei selbstverschuldeten Unfällen lassen sich die Gutachterkosten leider nicht über die
        gegnerische Haftpflichtversicherung regulieren — daher können wir Ihnen hier keinen
        kostenfreien Termin anbieten.
      </p>
      <p className="text-claimondo-navy/60 text-sm">
        Sollte sich die Schuldfrage noch ändern, melden Sie sich jederzeit gern wieder.
      </p>
    </div>
  )
}
