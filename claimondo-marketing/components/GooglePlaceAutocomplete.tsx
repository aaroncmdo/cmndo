'use client'

// Adress-Eingabe mit Vorschlaegen.
//
// Der Name bleibt (48 Aufrufstellen), die QUELLE hat gewechselt: Adressen kommen
// jetzt von Mapbox, Google nur noch fuer die Firmen-Suche (types=establishment).
//
// Grund — Vorfall 24.08.2026: Google Places lief in ein bewusst gesetztes
// Tageskontingent. Die Antwort kam mit HTTP 200 und dem Fehler im RUMPF, das Widget
// lud normal, `loadError` blieb null, und die Vorschlagsliste war einfach leer.
// Fuer Kundinnen: Adresse tippen, nichts passiert, kein Hinweis, kein Weiterkommen —
// gleichzeitig im Gutachter-Finder, in der Schadenmeldung, im Magic-Link-Flow und in
// allen Registrierungen. Live nachgestellt und belegt.
//
// Zwei Dinge sind dadurch besser, nicht nur wiederhergestellt:
//  1. Die Anfragen sind ENTPRELLT. Googles Widget feuerte pro Tastenanschlag
//     (gemessen: vier Anfragen fuer das Wort "Leichlingen") — das ist genau der
//     Grund, warum ein Tageskontingent so schnell greift. Jetzt: eine Anfrage
//     ~320 ms nach der letzten Taste.
//  2. Der Fehlerfall ist SICHTBAR. Kommt nichts zurueck, sagt das Feld es und
//     bietet die Freitext-Eingabe an — statt stumm stehenzubleiben.

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/lib/maps/load-google-maps'
import { sucheAdressVorschlaege, type AdressVorschlag } from '@/lib/mapbox/adress-vorschlaege'

export type PlaceResult = {
  adresse: string
  plz: string
  /** CMM-23: Straße + Hausnummer (z.B. "Bernhard-Feilchenfeld-Straße 7") */
  strasse: string
  /** CMM-23: Stadt / Ort (z.B. "Köln") */
  stadt: string
  lat: number
  lng: number
  place_id: string
  /** AAR-956: Business-Name bei types=establishment (sonst undefined). */
  name?: string
}

const ENTPRELLUNG_MS = 320

export default function GooglePlaceAutocomplete({
  defaultValue,
  types,
  placeholder,
  onSelect,
  onBlur,
  onChange,
  className,
  scrollIntoViewOnFocus,
  autoFocus,
}: {
  defaultValue?: string
  /** AAR-956: Autocomplete-Typ. Default ['address'] (Mapbox); ['establishment'] = Google-Business-Suche. */
  types?: string[]
  placeholder?: string
  onSelect: (result: PlaceResult) => void
  onBlur?: (currentValue: string) => void
  onChange?: (currentValue: string) => void
  className?: string
  scrollIntoViewOnFocus?: boolean
  autoFocus?: boolean
}) {
  // types=establishment ist die Firmen-Suche — dafuer bleibt Google, weil Mapbox
  // Betriebsnamen deutlich schlechter trifft. Alles andere laeuft ueber Mapbox.
  const istFirmenSuche = (types ?? []).includes('establishment')

  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue ?? '')
  const [vorschlaege, setVorschlaege] = useState<AdressVorschlag[]>([])
  const [offen, setOffen] = useState(false)
  const [aktiv, setAktiv] = useState(-1)
  const [sucht, setSucht] = useState(false)
  const [ohneTreffer, setOhneTreffer] = useState(false)

  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const abbruch = useRef<AbortController | null>(null)

  // NUR eine echte Tastatureingabe darf eine Suche ausloesen.
  //
  // Vorgeschichte — zwei Anlaeufe, beide mit einem VERBRAUCHBAREN Token:
  //   `ausAuswahl`  unterdrueckt die naechste Suche nach einer Auswahl
  //   `ersterLauf`  ein vorbefuelltes Feld ist keine Suchanfrage (#5717; auf den ~300
  //                 Stadtseiten klappte die Liste beim Laden ueber den Absende-Button)
  // Beide setzt der Such-Effect beim Durchlauf selbst zurueck — sie gelten also fuer
  // GENAU EINE Aenderung.
  //
  // Das reicht nicht. Nach einer Auswahl aendert sich `value` ZWEIMAL (gemessen 29.08.
  // auf /check, Playwright + document.elementFromPoint):
  //   1. waehle() setzt den gewaehlten Treffer                 -> "Domkloster 4, 50667 Köln"
  //   2. onSelect() -> der Parent setzt seinen State und spielt ihn ueber `defaultValue`
  //      zurueck, und zwar ANDERS: die 5 Lead-Formulare nehmen `r.stadt`  -> "Köln"
  // Aenderung 1 verbraucht das Token, Aenderung 2 laeuft ungeschuetzt durch -> eine neue
  // Suche nach "Köln" klappt die Liste wieder auf, direkt ueber dem Absende-Button.
  // Folge: der naechste Klick des Nutzers traf einen Vorschlag ("Kölner Straße, 01159
  // Dresden") statt "Absenden" — also ein FALSCHER Ort statt einer Meldung.
  //
  // Ein ZUSTAND statt eines Tokens loest die ganze Klasse: wie oft `value` sich
  // programmatisch auch aendert, gesucht wird nur, wenn zuletzt jemand getippt hat.
  // (Der Mini-Wizard war nie betroffen — er spielt `r.adresse` zurueck, also denselben
  // Wert, und loest die zweite Aenderung gar nicht erst aus.)
  const vomTippen = useRef(false)

  useEffect(() => {
    if (defaultValue !== undefined && defaultValue !== value) {
      vomTippen.current = false
      setValue(defaultValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue])

  // ---------------------------------------------------------------- Mapbox-Weg
  useEffect(() => {
    if (istFirmenSuche) return
    // Kein Tippen, keine Suche — deckt Initialwert, Auswahl und Parent-Sync gleichermassen ab.
    if (!vomTippen.current) return
    const q = value.trim()
    if (q.length < 3) { setVorschlaege([]); setOhneTreffer(false); setOffen(false); return }

    const t = window.setTimeout(async () => {
      abbruch.current?.abort()
      const ctrl = new AbortController()
      abbruch.current = ctrl
      setSucht(true)
      const treffer = await sucheAdressVorschlaege(q, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setSucht(false)
      setVorschlaege(treffer)
      setAktiv(-1)
      setOhneTreffer(treffer.length === 0)
      setOffen(true)
    }, ENTPRELLUNG_MS)

    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, istFirmenSuche])

  const waehle = useCallback((v: AdressVorschlag) => {
    vomTippen.current = false
    setValue(v.adresse)
    setOffen(false)
    setVorschlaege([])
    setOhneTreffer(false)
    onSelectRef.current({ ...v })
  }, [])

  // ---------------------------------------------------- Google-Weg (nur Firmen)
  const googleRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [googleLaedt, setGoogleLaedt] = useState(istFirmenSuche)
  useEffect(() => {
    if (!istFirmenSuche) return
    let abgebrochen = false
    loadGoogleMaps()
      .then(() => {
        if (abgebrochen || !inputRef.current || googleRef.current) return
        if (typeof google === 'undefined' || !google.maps?.places) return
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'de' },
          fields: ['name', 'formatted_address', 'geometry', 'place_id', 'address_components'],
          types: ['establishment'],
        })
        ac.addListener('place_changed', () => {
          const p = ac.getPlace()
          const placeId = p.place_id ?? ''
          if (!placeId) return
          const loc = p.geometry?.location
          let plz = ''; let route = ''; let nr = ''; let stadt = ''
          for (const c of p.address_components ?? []) {
            if (c.types.includes('postal_code')) plz = c.long_name
            else if (c.types.includes('route')) route = c.long_name
            else if (c.types.includes('street_number')) nr = c.long_name
            else if (c.types.includes('locality')) stadt = c.long_name
            else if (!stadt && c.types.includes('postal_town')) stadt = c.long_name
          }
          const adresse = p.formatted_address ?? p.name ?? ''
          vomTippen.current = false
          setValue(adresse)
          onSelectRef.current({
            adresse, plz, strasse: [route, nr].filter(Boolean).join(' ').trim(), stadt,
            lat: loc ? loc.lat() : 0, lng: loc ? loc.lng() : 0,
            place_id: placeId, name: p.name ?? undefined,
          })
        })
        googleRef.current = ac
        setGoogleLaedt(false)
      })
      .catch((err) => { setGoogleLaedt(false); console.error('[PlaceAutocomplete/google]', err) })
    return () => { abgebrochen = true }
  }, [istFirmenSuche])

  useEffect(() => { if (autoFocus && !googleLaedt) inputRef.current?.focus() }, [autoFocus, googleLaedt])

  const defaultCls = 'w-full px-4 py-3 rounded-ios-xl border border-claimondo-border bg-white text-claimondo-navy placeholder-claimondo-ondo/60 text-sm focus:outline-none focus:border-claimondo-ondo transition-colors'

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        autoComplete="off"
        role={istFirmenSuche ? undefined : 'combobox'}
        aria-expanded={istFirmenSuche ? undefined : offen}
        aria-autocomplete={istFirmenSuche ? undefined : 'list'}
        // vomTippen: der EINZIGE Pfad, der eine Suche ausloesen darf.
        onChange={e => { vomTippen.current = true; setValue(e.target.value); onChange?.(e.target.value) }}
        onKeyDown={e => {
          // Enter darf nie das umgebende Formular abschicken (AAR-237) — es waehlt
          // stattdessen den markierten Vorschlag.
          if (e.key === 'Enter') {
            e.preventDefault()
            if (offen && aktiv >= 0 && vorschlaege[aktiv]) waehle(vorschlaege[aktiv])
            return
          }
          if (istFirmenSuche || !offen || vorschlaege.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setAktiv(i => (i + 1) % vorschlaege.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv(i => (i <= 0 ? vorschlaege.length - 1 : i - 1)) }
          else if (e.key === 'Escape') setOffen(false)
        }}
        // Blur verzoegert: ein Klick auf einen Vorschlag loest sonst zuerst Blur aus
        // und die Liste waere weg, bevor der Klick ankommt.
        onBlur={() => { window.setTimeout(() => setOffen(false), 160); onBlur?.(value) }}
        onFocus={() => {
          if (vorschlaege.length > 0) setOffen(true)
          if (scrollIntoViewOnFocus) {
            window.setTimeout(() => inputRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350)
          }
        }}
        placeholder={googleLaedt ? 'Lädt…' : placeholder ?? 'Adresse eingeben...'}
        className={className ?? defaultCls}
        disabled={googleLaedt}
      />

      {!istFirmenSuche && offen && vorschlaege.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-ios-lg border border-claimondo-border bg-white shadow-lg"
        >
          {vorschlaege.map((v, i) => (
            <li key={v.place_id || `${v.lat},${v.lng}`} role="option" aria-selected={i === aktiv}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => waehle(v)}
                onMouseEnter={() => setAktiv(i)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  i === aktiv ? 'bg-claimondo-bg text-claimondo-navy' : 'text-claimondo-navy hover:bg-claimondo-bg'
                }`}
              >
                {v.adresse}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!istFirmenSuche && sucht && value.trim().length >= 3 && vorschlaege.length === 0 && (
        <p className="text-caption text-claimondo-ondo mt-1">Suche Adressen…</p>
      )}

      {/* Der sichtbare Fehlerfall: genau das, was am 24.08. gefehlt hat. */}
      {!istFirmenSuche && ohneTreffer && !sucht && (
        <p className="text-caption text-claimondo-ondo mt-1">
          Keine Adresse gefunden. Sie können sie trotzdem eintippen – wir ordnen den Ort beim Absenden zu.
        </p>
      )}
    </div>
  )
}
