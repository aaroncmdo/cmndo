'use client'

// Makler legt proaktiv einen Kunden an (Spec 2026-06-29-makler-anfrage-anlegen).
// Ein Submit -> erstelleMaklerAnfrage: entweder Rueckruf (Default) oder kanonischer
// FlowLink an den Kunden. Makler-Attribution (promotion_code_id) wird serverseitig
// aus dem eingeloggten Makler abgeleitet — hier nichts mitsenden.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { erstelleMaklerAnfrage, type MaklerAnfrageAusgang } from '@/lib/makler/erstelle-anfrage'

export function NeueAnfrageDrawer() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [kennzeichen, setKennzeichen] = useState('')
  const [standortOffen, setStandortOffen] = useState(false)
  // Besichtigungsort-Picker: strukturierte Auswahl (mit Koordinaten) ODER Freitext-Fallback (nur Text).
  const [standortText, setStandortText] = useState('')
  const [standortPlace, setStandortPlace] = useState<PlaceResult | null>(null)
  // Unfall-Qualifizierung: Verschulden entscheidet Haftpflicht vs. Kasko (der FlowLink haengt daran).
  // 'eigenverantwortung' braucht die Kasko-Folgefrage — sonst disqualifiziert das Flow-Quali-Gate
  // den Lead still (qualiFlowOutcome: eigenverantwortung + offene VS-Frage -> Abbruch).
  const [schuldfrage, setSchuldfrage] = useState<'' | 'gegner' | 'unklar' | 'eigenverantwortung'>('')
  const [eigeneVersicherung, setEigeneVersicherung] = useState<'' | 'ja' | 'nein'>('')
  const [polizei, setPolizei] = useState<'' | 'ja' | 'nein'>('')
  const [ausgang, setAusgang] = useState<MaklerAnfrageAusgang>('rueckruf') // Default = Rueckruf
  const [rueckrufZeit, setRueckrufZeit] = useState('')
  const [notiz, setNotiz] = useState('')
  const [consent, setConsent] = useState(false)

  function reset() {
    setVorname(''); setNachname(''); setTelefon(''); setEmail(''); setKennzeichen('')
    setStandortText(''); setStandortPlace(null); setStandortOffen(false)
    setSchuldfrage(''); setEigeneVersicherung(''); setPolizei('')
    setAusgang('rueckruf'); setRueckrufZeit('')
    setNotiz(''); setConsent(false)
  }

  function submit() {
    if (!vorname.trim() || !nachname.trim()) { toast.error('Vor- und Nachname erforderlich'); return }
    if (telefon.trim().length < 5) { toast.error('Telefonnummer erforderlich'); return }
    // Kasko/Haftpflicht-Qualifizierung: 'Der Kunde selbst' ohne Kasko-Antwort wuerde den Lead
    // im Flow still disqualifizieren -> Folgefrage hier erzwingen.
    if (schuldfrage === 'eigenverantwortung' && !eigeneVersicherung) {
      toast.error('Bitte angeben, ob der Kunde kaskoversichert ist.'); return
    }
    if (!consent) { toast.error('Bitte die Einwilligung des Kunden bestätigen'); return }
    startTransition(async () => {
      const res = await erstelleMaklerAnfrage({
        vorname,
        nachname,
        telefon,
        email: email || null,
        kennzeichen: kennzeichen.trim() || null,
        standortPlz: standortPlace?.plz || null,
        standortOrt: standortPlace?.adresse || standortText.trim() || null,
        standortLat: standortPlace?.lat ?? null,
        standortLng: standortPlace?.lng ?? null,
        standortPlaceId: standortPlace?.place_id || null,
        schuldfrage: schuldfrage || null,
        eigeneVersicherung: eigeneVersicherung || null,
        polizeiVorOrt: polizei === 'ja' ? true : polizei === 'nein' ? false : null,
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

  const selectCard = (selected: boolean, onSelect: () => void, titel: string, sub: string | null, group: string) => (
    <label
      className={`flex cursor-pointer flex-col rounded-ios-md border p-3 text-sm transition ${
        selected ? 'border-claimondo-ondo bg-claimondo-ondo/10' : 'border-claimondo-border'
      }`}
    >
      <input type="radio" name={group} className="sr-only" checked={selected} onChange={onSelect} />
      <span className="font-semibold text-claimondo-navy">{titel}</span>
      {sub ? <span className="mt-0.5 text-xs text-claimondo-shield">{sub}</span> : null}
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
          <TextField label="Kennzeichen (optional)" value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)} placeholder="z. B. K-AB 1234" />

          <button
            type="button"
            className="text-sm font-medium text-claimondo-ondo underline-offset-2 hover:underline"
            onClick={() => setStandortOffen((v) => !v)}
          >
            {standortOffen ? '− Besichtigungsort ausblenden' : '+ Besichtigungsort hinzufügen (optional)'}
          </button>
          {standortOffen ? (
            <div className="space-y-1">
              <label htmlFor="adr-neueanfragedrawer" className="block text-xs font-semibold text-claimondo-shield">
                Besichtigungsort (wo steht das Fahrzeug?)
              </label>
              <GooglePlaceAutocomplete
                id="adr-neueanfragedrawer"
                types={['address']}
                placeholder="Adresse oder Ort eingeben …"
                defaultValue={standortText}
                onSelect={(p) => { setStandortText(p.adresse); setStandortPlace(p) }}
                onChange={(v) => { setStandortText(v); setStandortPlace(null) }}
                scrollIntoViewOnFocus
              />
              <p className="text-[11px] text-claimondo-shield">
                Adresse aus der Liste wählen — dann kommt der Kunde bereits mit dem Besichtigungsort vorausgefüllt in seine Anfrage.
              </p>
            </div>
          ) : null}

          {/* Verschulden — Haftpflicht vs. Kasko. Optional; 'Der Kunde selbst' erzwingt die Kasko-Folgefrage. */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-claimondo-shield">Wer hat den Unfall verursacht? (optional)</span>
            <div className="grid grid-cols-1 gap-2">
              {selectCard(schuldfrage === 'gegner', () => { setSchuldfrage('gegner'); setEigeneVersicherung('') }, 'Der Unfallgegner', 'Ideal — die Gegnerseite reguliert (Haftpflicht).', 'makler-anfrage-schuld')}
              {selectCard(schuldfrage === 'eigenverantwortung', () => setSchuldfrage('eigenverantwortung'), 'Der Kunde selbst', 'Regulierung läuft über die Kaskoversicherung.', 'makler-anfrage-schuld')}
              {selectCard(schuldfrage === 'unklar', () => { setSchuldfrage('unklar'); setEigeneVersicherung('') }, 'Noch unklar', 'Klären wir gemeinsam.', 'makler-anfrage-schuld')}
            </div>
            {schuldfrage === 'eigenverantwortung' ? (
              <div className="space-y-1 rounded-ios-md bg-claimondo-bg p-3">
                <span className="text-xs font-semibold text-claimondo-shield">Hat der Kunde eine Kaskoversicherung? *</span>
                <div className="grid grid-cols-2 gap-3">
                  {selectCard(eigeneVersicherung === 'ja', () => setEigeneVersicherung('ja'), 'Ja', null, 'makler-anfrage-kasko')}
                  {selectCard(eigeneVersicherung === 'nein', () => setEigeneVersicherung('nein'), 'Nein', null, 'makler-anfrage-kasko')}
                </div>
              </div>
            ) : null}
          </div>

          {/* Polizeibeteiligung */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-claimondo-shield">War die Polizei vor Ort? (optional)</span>
            <div className="grid grid-cols-2 gap-3">
              {selectCard(polizei === 'ja', () => setPolizei('ja'), 'Ja', null, 'makler-anfrage-polizei')}
              {selectCard(polizei === 'nein', () => setPolizei('nein'), 'Nein', null, 'makler-anfrage-polizei')}
            </div>
          </div>

          <TextField
            label="Notiz für den Berater (optional)"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="z. B. Parkschaden, möchte schnell, spricht wenig Deutsch …"
          />

          <div className="space-y-2">
            <span className="text-xs font-semibold text-claimondo-shield">Wie soll es weitergehen?</span>
            <div className="grid grid-cols-2 gap-3">
              {selectCard(ausgang === 'rueckruf', () => setAusgang('rueckruf'), '📞 Rückruf buchen', 'Unser Team ruft den Kunden an.', 'makler-anfrage-ausgang')}
              {selectCard(ausgang === 'flowlink', () => setAusgang('flowlink'), '📲 Link an Kunden senden', 'Kunde wählt Gutachter & Termin selbst.', 'makler-anfrage-ausgang')}
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
