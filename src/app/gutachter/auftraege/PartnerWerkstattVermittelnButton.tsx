'use client'

// P4 (Netzwerk): CTA + Formular-Modal fuer die SV-Selbstanlage "Partner-Werkstatt
// vermitteln" (Spec 3 §3 Schritt 1). Button + Modal in EINER Client-Komponente
// (Plan sah Button+Sheet getrennt vor; primitives.Modal mit bottom-sheet-Placement
// ist der Komponenten-Set-konforme Weg — ui/sheet existiert nicht).

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HandshakeIcon, ScanTextIcon } from 'lucide-react'
import { Button, Modal } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { vermittlePartnerWerkstatt } from './_actions/vermittle-partner-werkstatt'
// E3b (Ops-Test #23): Felder aus dem Gutachten vorschlagen, statt sie abtippen zu lassen.
import { liesGutachtenFelder, type GutachtenVorschlag } from './_actions/lies-gutachten-felder'

export default function PartnerWerkstattVermittelnButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [flowLinkUrl, setFlowLinkUrl] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // E3b: Vorschlag aus dem Gutachten. `ocrRunde` remountet die betroffenen Felder, damit
  // ihr `defaultValue` greift — so bleibt das Formular uncontrolled (FormData beim
  // Submit) und der bestehende Absende-Pfad voellig unberuehrt.
  const [vorschlag, setVorschlag] = useState<GutachtenVorschlag | null>(null)
  const [ocrRunde, setOcrRunde] = useState(0)
  const [liest, startLesen] = useTransition()

  function ausGutachtenUebernehmen() {
    const form = formRef.current
    if (!form) return
    startLesen(async () => {
      const res = await liesGutachtenFelder(new FormData(form))
      if (!res.ok) {
        // Das Auslesen ist eine Hilfe, kein Muss — bei Fehlschlag bleibt das Formular
        // wie es ist und der SV tippt weiter von Hand.
        toast.error(res.error)
        return
      }
      setVorschlag(res.vorschlag)
      setOcrRunde((n) => n + 1)
      toast.success(
        res.gefunden > 0
          ? `${res.gefunden} Feld${res.gefunden === 1 ? '' : 'er'} übernommen — bitte prüfen und ergänzen.`
          : 'Im Gutachten war nichts eindeutig lesbar — bitte von Hand ausfüllen.',
      )
    })
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await vermittlePartnerWerkstatt(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setFlowLinkUrl(result.flowLinkUrl)
      toast.success('Vorgang angelegt — der Link wurde an den Kunden verschickt.')
      formRef.current?.reset()
    })
  }

  function close() {
    setOpen(false)
    setFlowLinkUrl(null)
  }

  return (
    <>
      <Button variant="navy" onClick={() => setOpen(true)}>
        <span className="inline-flex items-center gap-2">
          <HandshakeIcon width={16} height={16} />
          Partner-Werkstatt vermitteln
        </span>
      </Button>

      <Modal open={open} onClose={close} ariaLabel="Partner-Werkstatt vermitteln" maxWidth={560} placement="bottom-sheet">
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-heading-sm text-claimondo-navy font-semibold">Partner-Werkstatt vermitteln</h2>
            <p className="text-body-sm text-claimondo-ondo">
              Sie haben das Gutachten bereits erstellt? Legen Sie den Vorgang hier an — Ihr Kunde
              erhält einen Link, bestätigt den Auftrag und wählt eine Partner-Werkstatt aus Ihrem
              Netzwerk. Regulierung und Reparatur starten erst nach seiner Bestätigung.
            </p>
          </div>

          {flowLinkUrl ? (
            <div className="space-y-4">
              <p className="text-body-sm text-claimondo-navy">
                Der Vorgang ist angelegt. Diesen Link kann der Kunde auch direkt öffnen:
              </p>
              <div className="rounded-ios-sm bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy break-all select-all">
                {flowLinkUrl}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(flowLinkUrl)
                    toast.success('Link kopiert.')
                  }}
                >
                  Link kopieren
                </Button>
                <Button variant="navy" onClick={close}>Fertig</Button>
              </div>
            </div>
          ) : (
            <form
              ref={formRef}
              action={submit}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Vorname" name="vorname" required autoComplete="off" />
                <TextField label="Nachname" name="nachname" required autoComplete="off" />
                <TextField label="Telefon" name="telefon" type="tel" hint="Telefon oder E-Mail — mindestens eines" />
                <TextField label="E-Mail" name="email" type="email" />
                <TextField
                  key={`kz-${ocrRunde}`}
                  label="Kennzeichen"
                  name="kennzeichen"
                  required
                  placeholder="B-XX 123"
                  defaultValue={vorschlag?.kennzeichen ?? ''}
                />
                <TextField label="Unfallort" name="unfallort" placeholder="Stadt / Adresse" />
                <TextField label="Hersteller" name="fahrzeug_hersteller" placeholder="z. B. BMW" />
                {/* Das OCR-Schema kennt nur einen kombinierten `fahrzeug_typ` ("BMW 320d") —
                    er landet unzerlegt hier, weil ein Split am Leerzeichen bei
                    "Mercedes-Benz C 200" falsch waere. Der SV rueckt es zurecht. */}
                <TextField
                  key={`modell-${ocrRunde}`}
                  label="Modell"
                  name="fahrzeug_modell"
                  placeholder="z. B. 320d"
                  defaultValue={vorschlag?.fahrzeug_typ ?? ''}
                />
              </div>
              <TextField
                label="Schadenshergang (optional)"
                name="schadens_hergang"
                placeholder="Kurzbeschreibung für die Akte"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  key={`betrag-${ocrRunde}`}
                  label="Schadenshöhe netto (€)"
                  name="betrag"
                  required
                  inputMode="decimal"
                  placeholder="z. B. 4200,50"
                  defaultValue={
                    vorschlag?.betrag != null ? String(vorschlag.betrag).replace('.', ',') : ''
                  }
                />
                <TextField
                  label="Gutachten (PDF)"
                  name="datei"
                  type="file"
                  required
                  accept="application/pdf"
                />
              </div>

              {/* E3b: liest Kennzeichen, Fahrzeug und Schadenshöhe aus dem hochgeladenen
                  Gutachten. Bewusst ein eigener Klick statt automatisch beim Dateiwaehlen:
                  der SV entscheidet, wann gelesen wird, und jeder Lauf kostet einen
                  LLM-Aufruf. Die Werte werden VORGESCHLAGEN, nicht gesetzt — geprueft wird
                  am Formular (Lehre aus B5: ungeprueftes OCR schrieb dort Formular-Labels
                  als Halteradresse in den Lead). */}
              <div className="flex items-center justify-between gap-3 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5">
                <p className="text-xs text-claimondo-ondo">
                  Felder aus dem Gutachten übernehmen — Sie können jeden Wert danach ändern.
                </p>
                <Button variant="ghost" type="button" onClick={ausGutachtenUebernehmen} loading={liest}>
                  <ScanTextIcon width={15} height={15} />
                  Auslesen
                </Button>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={close} type="button">Abbrechen</Button>
                <Button variant="navy" type="submit" loading={pending}>
                  Vorgang anlegen
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </>
  )
}
