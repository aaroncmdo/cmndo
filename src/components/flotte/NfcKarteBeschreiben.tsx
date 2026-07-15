'use client'

// NFC-Karte beschreiben — SCAN-FIRST.
//
// Der Operator scannt ZUERST den aufgeklebten QR der Karte. Erst dann wird genau DIESER
// Token auf den Chip geschrieben. Wuerde man stattdessen einen Token aus einer Liste waehlen
// und auf die gerade aufliegende Karte schreiben, koennte Token X auf die Karte mit Aufkleber Y
// landen -- die Karte haette zwei Identitaeten (Auflegen -> Fahrzeug A, Scannen -> Fahrzeug B).
// Indem die Karte sich SELBST identifiziert, ist Chip == Aufdruck per Konstruktion.
import { useEffect, useState } from 'react'
import { SchadenkarteScanner } from '@/components/flotte/SchadenkarteScanner'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
import {
  nfcVerfuegbar,
  chipTraegtToken,
  NDEF_RECORD_TYPE,
  type NdefReaderCtor,
  type NdefReadingEventLike,
} from '@/lib/schadenkarte/nfc'

type Props = {
  onNfcUid: (token: string, nfcUid: string) => Promise<{ ok: boolean; error?: string }>
}

type Phase = 'scannen' | 'auflegen' | 'fertig'

export function NfcKarteBeschreiben({ onNfcUid }: Props) {
  const [phase, setPhase] = useState<Phase>('scannen')
  const [token, setToken] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  // Verfuegbarkeit ERST NACH Mount pruefen (kein Hydration-Mismatch): der Server kennt kein
  // `window` -> unterstuetzt waere dort immer false. Ein direktes nfcVerfuegbar() im Render-
  // Body wuerde auf Android/Chrome beim Hydrieren sofort auf true kippen, waehrend das Server-
  // HTML noch den iPhone-Hinweis zeigt -> Mismatch. Analog kameraVerfuegbar in
  // SchadenkarteScanner.tsx (selbes Verzeichnis, exakt dasselbe Muster).
  const [unterstuetzt, setUnterstuetzt] = useState(false)
  useEffect(() => {
    setUnterstuetzt(nfcVerfuegbar())
  }, [])

  async function beschreibe(t: string) {
    setFehler(null)
    setLaeuft(true)
    try {
      const Ctor = (window as unknown as { NDEFReader: NdefReaderCtor }).NDEFReader
      const url = buildSchadenkarteUrl(t)

      // 1) Schreiben
      const writer = new Ctor()
      await writer.write({ records: [{ recordType: NDEF_RECORD_TYPE, data: url }] })

      // 2) Zurueck lesen + verifizieren. Ohne bestaetigten Rueckweg gilt die Karte als NICHT
      //    beschrieben -- lieber einmal zu viel schreiben als eine unverifizierte Karte ausliefern.
      const reader = new Ctor()
      const controller = new AbortController()
      const gelesen = await new Promise<{ url: string | null; uid: string | null }>((resolve) => {
        const timeout = setTimeout(() => {
          controller.abort()
          resolve({ url: null, uid: null })
        }, 10_000)

        reader.onreading = (ev: NdefReadingEventLike) => {
          clearTimeout(timeout)
          const rec = ev.message.records.find((r) => r.recordType === NDEF_RECORD_TYPE)
          const text = rec?.data ? new TextDecoder().decode(rec.data) : null
          controller.abort()
          resolve({ url: text, uid: ev.serialNumber ?? null })
        }
        reader.onreadingerror = () => {
          clearTimeout(timeout)
          controller.abort()
          resolve({ url: null, uid: null })
        }
        void reader.scan({ signal: controller.signal })
      })

      if (!chipTraegtToken(gelesen.url, t)) {
        setFehler(
          'Die Karte konnte nicht verifiziert werden. Bitte erneut auflegen — sie gilt als nicht beschrieben.',
        )
        return
      }

      // 3) Chip-Seriennummer vermerken (Nachweis „beschrieben")
      if (gelesen.uid) {
        const res = await onNfcUid(t, gelesen.uid)
        if (!res.ok) {
          setFehler(res.error ?? 'Chip-Kennung konnte nicht gespeichert werden.')
          return
        }
      }

      setPhase('fertig')
    } catch (err) {
      setFehler(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'NFC-Zugriff wurde abgelehnt. Bitte erlauben und erneut versuchen.'
          : 'Beschreiben fehlgeschlagen. Karte länger auflegen und erneut versuchen.',
      )
    } finally {
      setLaeuft(false)
    }
  }

  if (!unterstuetzt) {
    return (
      <SectionCard title="Karte beschreiben (NFC)">
        <p className="text-sm text-claimondo-shield">
          NFC-Beschreiben braucht ein Android-Gerät mit Chrome. Auf dem iPhone ist das technisch
          nicht möglich.{' '}
          <strong className="text-claimondo-navy">
            Die Karte funktioniert trotzdem — über den aufgeklebten QR-Code.
          </strong>
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Karte beschreiben (NFC)"
      subtitle="Zuerst den aufgeklebten QR-Code der Karte scannen, dann die Karte an das Gerät halten."
    >
      {phase === 'scannen' && (
        <SchadenkarteScanner
          disabled={laeuft}
          onToken={(t) => {
            setToken(t)
            setPhase('auflegen')
          }}
        />
      )}

      {phase === 'auflegen' && token && (
        <div className="space-y-3">
          <p className="text-sm text-claimondo-ondo">
            Karte <span className="font-mono">{token}</span> jetzt an das Gerät halten.
          </p>
          <Button variant="ondo" loading={laeuft} onClick={() => beschreibe(token)}>
            Karte beschreiben
          </Button>
        </div>
      )}

      {phase === 'fertig' && (
        <div className="space-y-3">
          <p className="text-sm text-success-strong">
            Karte beschrieben und verifiziert.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setToken(null)
              setFehler(null)
              setPhase('scannen')
            }}
          >
            Nächste Karte
          </Button>
        </div>
      )}

      {fehler && <p className="mt-3 text-sm text-danger-strong">{fehler}</p>}
    </SectionCard>
  )
}
