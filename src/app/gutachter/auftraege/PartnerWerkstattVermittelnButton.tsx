'use client'

// P4 (Netzwerk): CTA + Formular-Modal fuer die SV-Selbstanlage "Partner-Werkstatt
// vermitteln" (Spec 3 §3 Schritt 1). Button + Modal in EINER Client-Komponente
// (Plan sah Button+Sheet getrennt vor; primitives.Modal mit bottom-sheet-Placement
// ist der Komponenten-Set-konforme Weg — ui/sheet existiert nicht).

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HandshakeIcon } from 'lucide-react'
import { Button, Modal } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { vermittlePartnerWerkstatt } from './_actions/vermittle-partner-werkstatt'

export default function PartnerWerkstattVermittelnButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [flowLinkUrl, setFlowLinkUrl] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

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
                <TextField label="Kennzeichen" name="kennzeichen" required placeholder="B-XX 123" />
                <TextField label="Unfallort" name="unfallort" placeholder="Stadt / Adresse" />
                <TextField label="Hersteller" name="fahrzeug_hersteller" placeholder="z. B. BMW" />
                <TextField label="Modell" name="fahrzeug_modell" placeholder="z. B. 320d" />
              </div>
              <TextField
                label="Schadenshergang (optional)"
                name="schadens_hergang"
                placeholder="Kurzbeschreibung für die Akte"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Schadenshöhe netto (€)"
                  name="betrag"
                  required
                  inputMode="decimal"
                  placeholder="z. B. 4200,50"
                />
                <TextField
                  label="Gutachten (PDF)"
                  name="datei"
                  type="file"
                  required
                  accept="application/pdf"
                />
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
