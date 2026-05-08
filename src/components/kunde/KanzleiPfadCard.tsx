'use client'

// CMM-32 Polish: Kanzlei-Pfad-Wahl im Kunde-Portal.
//
// Switch je nach claim.kanzlei_wunsch:
//   - 'partnerkanzlei'                → null (Standardweg ueber LexDrive,
//                                       der Kanzlei-Sub-Stepper im
//                                       ClaimStepper zeigt das ohnehin)
//   - 'eigene_kanzlei'                → EigeneKanzleiPaketCard
//                                       (Kunde traegt Email + sendet)
//   - 'keine_kanzlei'                 → SelbstEinreichenCard
//                                       (Kunde laedt Gutachten +
//                                        reicht bei VS selbst ein)
//   - 'noch_unentschieden' / null     → FrageCard mit 3 Optionen
//                                       (Komplettservice / eigene Kanzlei
//                                        / selbst einreichen)
//
// Kunde kann seinen Wunsch eigenstaendig setzen (nicht nur KB-getriggert)
// solange das Paket noch nicht versendet/uebergeben ist.

import EigeneKanzleiPaketCard from './EigeneKanzleiPaketCard'

type KanzleiWunsch =
  | 'partnerkanzlei'
  | 'eigene_kanzlei'
  | 'keine_kanzlei'
  | 'noch_unentschieden'
  | 'nicht_gefragt'

type Props = {
  claimId: string
  kanzleiWunsch: KanzleiWunsch | null
  kanzleiName: string | null
  kanzleiEmail: string | null
  kanzleiTelefon: string | null
  kanzleiUebergebenAm: string | null
  gutachtenFreigegeben: boolean
  /** URL zum Gutachten-PDF — fuer den Download-Button im Selbst-Einreichen-Pfad. */
  gutachtenUrl: string | null
}

export default function KanzleiPfadCard({
  claimId,
  kanzleiWunsch,
  kanzleiName,
  kanzleiEmail,
  kanzleiTelefon,
  kanzleiUebergebenAm,
  gutachtenFreigegeben,
  gutachtenUrl,
}: Props) {
  // partnerkanzlei: keine eigene Card — Standardflow im Stepper sichtbar
  if (kanzleiWunsch === 'partnerkanzlei') return null

  if (kanzleiWunsch === 'eigene_kanzlei') {
    return (
      <EigeneKanzleiPaketCard
        claimId={claimId}
        kanzleiName={kanzleiName}
        kanzleiEmail={kanzleiEmail}
        kanzleiTelefon={kanzleiTelefon}
        bereitsVersendet={!!kanzleiUebergebenAm}
        uebergebenAm={kanzleiUebergebenAm}
        gutachtenFreigegeben={gutachtenFreigegeben}
      />
    )
  }

  if (kanzleiWunsch === 'keine_kanzlei') {
    // CMM-32 Polish: Selbst-einreichen-Panel lebt jetzt im Stepper
    // (FileText-Icon + Download-Button → Abschluss-Sprung). Diese Card
    // rendert nichts mehr fuer den Selbst-Pfad.
    return null
  }

  // unentschieden / nicht_gefragt / null — die Frage selbst lebt jetzt
  // im lila Top-Banner des ClaimSteppers (CMM-32 Polish, sobald QC durch
  // ist). Diese Card rendert in dem Fall nichts mehr.
  return null
}

