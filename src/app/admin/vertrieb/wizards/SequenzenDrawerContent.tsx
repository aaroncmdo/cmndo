'use client'
// Cold-Mailer S4: Sequenz-Builder — Vorlagen + Sequenzen + Steps in einem Drawer.
// Die Sequenz-LOGIK (Bedingungen, Skips, Faelligkeiten) liegt in der getesteten Engine;
// hier wird sie nur konfiguriert. Der stuendliche CRON-Advancer fuehrt sie dann aus.
import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives'
import MergeVarPalette from '../drawer/MergeVarPalette'
import { useMergeVarInsert } from '../drawer/useMergeVarInsert'
import {
  ladeVorlagen, speichereVorlage, generiereVorlage,
  ladeSequenzen, speichereSequenz, speichereStep, loescheStep,
  type Vorlage, type SequenzMitSteps,
} from '../_actions/cold-mail-sequenzen'

const FELD =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'
const LABEL = 'text-caption uppercase tracking-wide text-claimondo-ondo/60'

const ROLLEN = [
  { key: 'makler', label: 'Makler' },
  { key: 'werkstatt', label: 'Werkstatt' },
  { key: 'sachverstaendiger', label: 'Sachverständiger' },
] as const

const BEDINGUNGEN = [
  { key: 'immer', label: 'immer senden' },
  { key: 'wenn_nicht_geoeffnet', label: 'nur wenn vorige NICHT geöffnet' },
  { key: 'wenn_geoeffnet', label: 'nur wenn vorige geöffnet' },
  { key: 'wenn_keine_antwort', label: 'nur wenn keine Antwort' },
] as const

export default function SequenzenDrawerContent() {
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([])
  const [sequenzen, setSequenzen] = useState<SequenzMitSteps[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Vorlagen-Formular
  const [vName, setVName] = useState('')
  const [vRolle, setVRolle] = useState<string>('werkstatt')
  const [vBetreff, setVBetreff] = useState('')
  const [vBody, setVBody] = useState('')
  const vInsert = useMergeVarInsert({ betreff: vBetreff, setBetreff: setVBetreff, body: vBody, setBody: setVBody })
  const [vZiel, setVZiel] = useState('')
  const [kiBusy, setKiBusy] = useState(false)
  // null = neue Vorlage; sonst wird die Vorlage mit dieser id bearbeitet.
  const [vEditId, setVEditId] = useState<string | null>(null)

  // Sequenz-Formular
  const [sName, setSName] = useState('')
  const [sRolle, setSRolle] = useState<string>('werkstatt')

  async function laden() {
    const [v, s] = await Promise.all([ladeVorlagen(), ladeSequenzen()])
    if (v.ok) setVorlagen(v.data)
    else setFehler(v.error)
    if (s.ok) setSequenzen(s.data)
    else setFehler(s.error)
  }
  useEffect(() => {
    laden()
  }, [])

  async function kiEntwurf() {
    setKiBusy(true)
    setFehler(null)
    const res = await generiereVorlage({
      rolle: vRolle as 'makler' | 'werkstatt' | 'sachverstaendiger',
      ziel: vZiel,
    })
    setKiBusy(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    // Entwurf NUR ins Formular — gespeichert wird erst bewusst.
    setVBetreff(res.data.betreff)
    setVBody(res.data.body_html)
  }

  function vorlageFormularZuruecksetzen() {
    setVEditId(null)
    setVName(''); setVBetreff(''); setVBody(''); setVZiel('')
    setVRolle('werkstatt')
  }

  function vorlageBearbeiten(v: Vorlage) {
    setVEditId(v.id)
    setVName(v.name)
    setVRolle(v.rolle ?? 'werkstatt')
    setVBetreff(v.betreff)
    setVBody(v.body_html)
  }

  async function vorlageSpeichern() {
    setBusy(true)
    setFehler(null)
    // id gesetzt -> Update, sonst Insert (speichereVorlage entscheidet).
    const res = await speichereVorlage({
      id: vEditId ?? undefined,
      name: vName, rolle: vRolle, betreff: vBetreff, body_html: vBody,
    })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    vorlageFormularZuruecksetzen()
    await laden()
  }

  async function sequenzAnlegen() {
    setBusy(true)
    setFehler(null)
    const res = await speichereSequenz({ rolle: sRolle, name: sName, aktiv: false, auto_enroll: false })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    setSName('')
    await laden()
  }

  async function sequenzPatch(s: SequenzMitSteps, p: Partial<SequenzMitSteps>) {
    setBusy(true)
    setFehler(null)
    // NUR das getoggelte Flag durchreichen — nicht beide aus dem (evtl. veralteten)
    // Client-State, sonst ueberschreibt ein Toggle das andere (Clobbering-Race).
    const res = await speichereSequenz({
      id: s.id, rolle: s.rolle, name: s.name,
      ...(p.aktiv !== undefined ? { aktiv: p.aktiv } : {}),
      ...(p.auto_enroll !== undefined ? { auto_enroll: p.auto_enroll } : {}),
    })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    await laden()
  }

  async function stepAnlegen(s: SequenzMitSteps, vorlageId: string, delay: number, bedingung: string) {
    setBusy(true)
    setFehler(null)
    const naechste = Math.max(0, ...s.steps.map((st) => st.position)) + 1
    const res = await speichereStep({
      sequenz_id: s.id, position: naechste, vorlage_id: vorlageId,
      delay_tage: delay, bedingung: bedingung as 'immer',
    })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Schritt konnte nicht angelegt werden.')
      return
    }
    await laden()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-heading-sm text-claimondo-navy">Cold-Mail-Sequenzen</h2>
        <p className="mt-1 text-body-sm text-claimondo-ondo/70">
          Vorlagen schreiben, zu einer Sequenz verketten, aktivieren. Der stündliche Advancer sendet
          dann automatisch — Bedingungen entscheiden pro Schritt, ob er greift oder übersprungen wird.
        </p>
      </div>
      {fehler && <p className="text-sm text-danger">{fehler}</p>}

      {/* ── Vorlagen ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={LABEL}>Vorlagen ({vorlagen.length})</p>
        {vorlagen.length > 0 && (
          <ul className="space-y-1">
            {vorlagen.map((v) => (
              <li
                key={v.id}
                className={`rounded-ios-md border px-3 py-2 ${vEditId === v.id ? 'border-claimondo-ondo bg-claimondo-ondo/5' : 'border-claimondo-border bg-claimondo-bg/40'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body-sm text-claimondo-navy">{v.name}</p>
                    <p className="text-caption text-claimondo-ondo/60 truncate">
                      {v.rolle ?? 'alle Rollen'} · {v.betreff}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => vorlageBearbeiten(v)}>
                    Bearbeiten
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-ios-md border border-claimondo-border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium text-claimondo-navy">
              {vEditId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
            </p>
            {vEditId && (
              <Button variant="ghost" size="sm" onClick={vorlageFormularZuruecksetzen}>
                + Neue Vorlage
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Name (intern)" className={FELD} />
            <select value={vRolle} onChange={(e) => setVRolle(e.target.value)} aria-label="Rolle" className={FELD}>
              {ROLLEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              value={vZiel}
              onChange={(e) => setVZiel(e.target.value)}
              placeholder="Ziel der Mail — z.B. Termin vereinbaren"
              className={`${FELD} flex-1`}
            />
            <Button variant="ondo" size="sm" loading={kiBusy} disabled={!vZiel.trim()} onClick={kiEntwurf}>
              ✨ KI-Entwurf
            </Button>
          </div>
          <input
            ref={vInsert.betreffRef}
            value={vBetreff}
            onChange={(e) => setVBetreff(e.target.value)}
            onFocus={() => vInsert.setAktivesFeld('betreff')}
            placeholder="Betreff"
            className={`${FELD} w-full`}
          />
          <textarea
            ref={vInsert.bodyRef}
            value={vBody}
            onChange={(e) => setVBody(e.target.value)}
            onFocus={() => vInsert.setAktivesFeld('body')}
            rows={6}
            placeholder="Text (HTML) — Variablen/Aktionen unten per Klick einfügen"
            className={`${FELD} w-full resize-y`}
          />
          <MergeVarPalette onInsert={vInsert.einfuegen} />
          <Button variant="navy" size="sm" loading={busy} disabled={!vName.trim() || !vBetreff.trim() || !vBody.trim()} onClick={vorlageSpeichern}>
            {vEditId ? 'Änderungen speichern' : 'Vorlage speichern'}
          </Button>
        </div>
      </section>

      {/* ── Sequenzen ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={LABEL}>Sequenzen ({sequenzen.length})</p>

        {sequenzen.map((s) => (
          <SequenzKarte
            key={s.id}
            sequenz={s}
            vorlagen={vorlagen.filter((v) => v.rolle === null || v.rolle === s.rolle)}
            busy={busy}
            onPatch={(p) => sequenzPatch(s, p)}
            onStep={(vid, delay, bed) => stepAnlegen(s, vid, delay, bed)}
            onStepWeg={async (id) => {
              await loescheStep(id)
              await laden()
            }}
          />
        ))}

        <div className="rounded-ios-md border border-claimondo-border bg-white p-3 space-y-2">
          <p className="text-body-sm font-medium text-claimondo-navy">Neue Sequenz</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Name" className={FELD} />
            <select value={sRolle} onChange={(e) => setSRolle(e.target.value)} aria-label="Rolle der Sequenz" className={FELD}>
              {ROLLEN.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <Button variant="navy" size="sm" loading={busy} disabled={!sName.trim()} onClick={sequenzAnlegen}>
            Sequenz anlegen
          </Button>
        </div>
      </section>
    </div>
  )
}

function SequenzKarte({
  sequenz, vorlagen, busy, onPatch, onStep, onStepWeg,
}: {
  sequenz: SequenzMitSteps
  vorlagen: Vorlage[]
  busy: boolean
  onPatch: (p: Partial<SequenzMitSteps>) => void
  onStep: (vorlageId: string, delay: number, bedingung: string) => void
  onStepWeg: (id: string) => void
}) {
  const [vid, setVid] = useState('')
  const [delay, setDelay] = useState(0)
  const [bed, setBed] = useState<string>('immer')
  const name = (id: string) => vorlagen.find((v) => v.id === id)?.name ?? '—'

  return (
    <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-body-sm font-medium text-claimondo-navy">{sequenz.name}</p>
          <p className="text-caption text-claimondo-ondo/60">
            {sequenz.rolle} · {sequenz.steps.length} Schritt{sequenz.steps.length === 1 ? '' : 'e'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={sequenz.aktiv ? 'navy' : 'ghost'} size="sm" loading={busy} onClick={() => onPatch({ aktiv: !sequenz.aktiv })}>
            {sequenz.aktiv ? 'Aktiv' : 'Inaktiv'}
          </Button>
          <Button
            variant={sequenz.auto_enroll ? 'navy' : 'ghost'}
            size="sm"
            loading={busy}
            onClick={() => onPatch({ auto_enroll: !sequenz.auto_enroll })}
          >
            {sequenz.auto_enroll ? 'Auto-Aufnahme an' : 'Auto-Aufnahme aus'}
          </Button>
        </div>
      </div>

      {sequenz.steps.length > 0 && (
        <ol className="space-y-1">
          {sequenz.steps.map((st) => (
            <li key={st.id} className="flex items-center justify-between gap-2 rounded-ios-sm bg-white px-2 py-1">
              <span className="text-caption text-claimondo-navy">
                {st.position}. {name(st.vorlage_id)} · nach {st.delay_tage} Tag{st.delay_tage === 1 ? '' : 'en'} ·{' '}
                {BEDINGUNGEN.find((b) => b.key === st.bedingung)?.label ?? st.bedingung}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onStepWeg(st.id)} ariaLabel="Schritt entfernen">
                ✕
              </Button>
            </li>
          ))}
        </ol>
      )}

      {vorlagen.length === 0 ? (
        <p className="text-caption text-claimondo-ondo/60">
          Erst eine Vorlage für „{sequenz.rolle}" anlegen — ohne Vorlage gibt es nichts zu senden.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <select value={vid} onChange={(e) => setVid(e.target.value)} aria-label="Vorlage" className={`${FELD} text-caption`}>
            <option value="">— Vorlage —</option>
            {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input
            type="number"
            min={0}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            aria-label="Wartezeit in Tagen"
            className={`${FELD} w-20 text-caption`}
          />
          <select value={bed} onChange={(e) => setBed(e.target.value)} aria-label="Bedingung" className={`${FELD} text-caption`}>
            {BEDINGUNGEN.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <Button variant="ondo" size="sm" loading={busy} disabled={!vid} onClick={() => { onStep(vid, delay, bed); setVid('') }}>
            + Schritt
          </Button>
        </div>
      )}
    </div>
  )
}
