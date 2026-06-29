'use client'

// Makler legt proaktiv einen Kunden an (Spec 2026-06-29-makler-anfrage-anlegen).
// Ein Submit -> erstelleMaklerAnfrage: entweder Rueckruf (Default) oder kanonischer
// FlowLink an den Kunden. Makler-Attribution (promotion_code_id) wird serverseitig
// aus dem eingeloggten Makler abgeleitet — hier nichts mitsenden.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { erstelleMaklerAnfrage, type MaklerAnfrageAusgang } from '@/lib/makler/erstelle-anfrage'

export function NeueAnfrageDrawer() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [standortOffen, setStandortOffen] = useState(false)
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [ausgang, setAusgang] = useState<MaklerAnfrageAusgang>('rueckruf') // Default = Rueckruf
  const [rueckrufZeit, setRueckrufZeit] = useState('')
  const [notiz, setNotiz] = useState('')
  const [consent, setConsent] = useState(false)

  function reset() {
    setVorname(''); setNachname(''); setTelefon(''); setEmail('')
    setPlz(''); setOrt(''); setStandortOffen(false); setAusgang('rueckruf'); setRueckrufZeit('')
    setNotiz(''); setConsent(false)
  }

  function submit() {
    if (!vorname.trim() || !nachname.trim()) { toast.error('Vor- und Nachname erforderlich'); return }
    if (telefon.trim().length < 5) { toast.error('Telefonnummer erforderlich'); return }
    if (!consent) { toast.error('Bitte die Einwilligung des Kunden bestätigen'); return }
    startTransition(async () => {
      const res = await erstelleMaklerAnfrage({
        vorname,
        nachname,
        telefon,
        email: email || null,
        standortPlz: plz || null,
        standortOrt: ort || null,
        notiz: notiz || null,
        kundeEinwilligung: consent,
        ausgang,
        rueckrufStartZeit: ausgang === 'rueckruf' && rueckrufZeit ? new Date(rueckrufZeit).toISOString() : null,
      })
      if (!res.ok) { toast.error(res.error); return }
      if (res.warnung) toast.warning(res.warnung)
      else toast.success(ausgang === 'flowlink' ? 'Link an den Kunden gesendet' : 'Rückruf gebucht')
      setOpen(false); reset()
    })
  }

  const ausgangOption = (key: MaklerAnfrageAusgang, titel: string, sub: string) => (
    <label
      className={`flex cursor-pointer flex-col rounded-ios-md border p-3 text-sm transition ${
        ausgang === key ? 'border-claimondo-ondo bg-claimondo-ondo/10' : 'border-claimondo-border'
      }`}
    >
      <input type="radio" name="makler-anfrage-ausgang" className="sr-only" checked={ausgang === key} onChange={() => setAusgang(key)} />
      <span className="font-semibold text-claimondo-navy">{titel}</span>
      <span className="mt-0.5 text-xs text-claimondo-shield">{sub}</span>
    </label>
  )

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Neue Anfrage</Button>
      <Modal
        open={open}
        onClose={() => { if (!pending) setOpen(false) }}
        maxWidth={520}
        placement="bottom-sheet"
        ariaLabel="Neue Anfrage anlegen"
      >
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-claimondo-navy">Neue Anfrage anlegen</h2>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} />
            <TextField label="Nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} />
          </div>
          <TextField label="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+49 …" />
          <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <button
            type="button"
            className="text-sm font-medium text-claimondo-ondo underline-offset-2 hover:underline"
            onClick={() => setStandortOffen((v) => !v)}
          >
            {standortOffen ? '− Standort ausblenden' : '+ Standort hinzufügen (optional)'}
          </button>
          {standortOffen ? (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="PLZ" value={plz} onChange={(e) => setPlz(e.target.value)} />
              <TextField label="Ort" value={ort} onChange={(e) => setOrt(e.target.value)} />
            </div>
          ) : null}

          <TextField
            label="Notiz für den Berater (optional)"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="z. B. Parkschaden, möchte schnell, spricht wenig Deutsch …"
          />

          <div className="space-y-2">
            <span className="text-xs font-semibold text-claimondo-shield">Wie soll es weitergehen?</span>
            <div className="grid grid-cols-2 gap-3">
              {ausgangOption('rueckruf', '📞 Rückruf buchen', 'Unser Team ruft den Kunden an.')}
              {ausgangOption('flowlink', '📲 Link an Kunden senden', 'Kunde wählt Gutachter & Termin selbst.')}
            </div>
            {ausgang === 'rueckruf' ? (
              <TextField
                label="Wunschzeit (optional)"
                type="datetime-local"
                value={rueckrufZeit}
                onChange={(e) => setRueckrufZeit(e.target.value)}
                hint="Leer = baldmöglichst"
              />
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-ios-md bg-claimondo-bg p-3 text-xs text-claimondo-shield">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-claimondo-ondo"
            />
            <span>Der Kunde ist mit der Kontaktaufnahme durch Claimondo einverstanden. *</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Abbrechen</Button>
            <Button onClick={submit} loading={pending}>Anlegen</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
