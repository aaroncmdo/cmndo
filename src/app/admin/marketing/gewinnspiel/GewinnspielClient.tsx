'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import {
  speichereKampagne,
  setzeKampagneAktiv,
  speicherePraemie,
  loeschePraemie,
  zieheHeute,
  sendeWelcomes,
  bestaetigeNachweis,
  lehneNachweisAb,
} from './actions'

type Kampagne = {
  id: string
  name: string
  start_am: string
  ende_am: string | null
  preise_pro_tag: number
  preis_betrag_eur: number
  topbar_text: string | null
  topbar_cta_text: string | null
  topbar_aktiv: boolean
  aktiv: boolean
}

type Praemie = {
  id: string
  name: string
  beschreibung: string | null
  bild_pfad: string | null
  betrag_eur: number
  sortierung: number
  aktiv: boolean
}

type QueueZeile = {
  id: string
  telefon_normalisiert: string
  gezogen_am: string | null
  nachweis_hochgeladen_am: string | null
  /** Signierter Link auf den hochgeladenen Nachweis (30 Min gueltig). */
  nachweisUrl: string | null
  praemieName: string | null
  name: string
  email: string | null
}

type HistorieZeile = {
  id: string
  telefon_normalisiert: string
  status: string
  gezogen_am: string | null
  gutschein_code: string | null
  name: string
  email: string | null
}

type Props = {
  kampagnen: Kampagne[]
  aktive: Kampagne | null
  praemien: Praemie[]
  kennzahlen: { offen: number; verifiziert: number; unversandt: number; bestaetigt: number }
  queue: QueueZeile[]
  historie: HistorieZeile[]
}

export default function GewinnspielClient({
  kampagnen,
  aktive,
  praemien,
  kennzahlen,
  queue,
  historie,
}: Props) {
  const [pending, startTransition] = useTransition()

  function lauf(fn: () => Promise<{ ok: boolean; error?: string }>, erfolg: string) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.error ?? 'Das hat nicht geklappt.')
        return
      }
      toast.success(erfolg)
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Heute ───────────────────────────────────────────────────────── */}
      <SectionCard title="Heute">
        {!aktive ? (
          <p className="text-body-sm text-claimondo-shield/70">
            Keine Kampagne aktiv. Ohne aktive Kampagne entstehen keine Teilnahmen.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kennzahl label="Im Lostopf" wert={kennzahlen.verifiziert} hinweis="verifiziert" />
              <Kennzahl label="Offen gesamt" wert={kennzahlen.offen} hinweis="inkl. unbestätigt" />
              <Kennzahl label="Ohne Welcome" wert={kennzahlen.unversandt} hinweis="noch nicht angeschrieben" />
              <Kennzahl label="Gutschein raus" wert={kennzahlen.bestaetigt} hinweis="bestätigt" />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="ghost"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await sendeWelcomes()
                    if (!res.ok) {
                      toast.error(res.error ?? 'Versand fehlgeschlagen.')
                      return
                    }
                    toast.success(
                      `${res.gesendet ?? 0} Willkommens-Nachrichten versendet` +
                        (res.fehlgeschlagen ? `, ${res.fehlgeschlagen} fehlgeschlagen` : ''),
                    )
                  })
                }
              >
                Willkommens-Nachrichten senden
              </Button>

              <Button
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await zieheHeute()
                    if (!res.ok) {
                      toast.error(res.error ?? 'Ziehung fehlgeschlagen.')
                      return
                    }
                    toast.success(
                      res.gezogen === 0
                        ? 'Keine Ziehung möglich: der Lostopf ist leer.'
                        : `${res.gezogen} Gewinner gezogen (aus ${res.lostopfGroesse} Teilnahmen).`,
                    )
                  })
                }
              >
                Jetzt ziehen
              </Button>
            </div>
            <p className="mt-2 text-body-xs text-claimondo-shield/60">
              Gezogen wird nur aus verifizierten Teilnahmen. Es werden bis zu{' '}
              {aktive.preise_pro_tag} Gewinner gezogen — bei weniger Teilnehmern entsprechend
              weniger.
            </p>
          </>
        )}
      </SectionCard>

      {/* ── Prüf-Queue ──────────────────────────────────────────────────── */}
      <SectionCard title={`Nachweise prüfen (${queue.length})`}>
        {queue.length === 0 ? (
          <p className="text-body-sm text-claimondo-shield/70">
            Keine offenen Nachweise.
          </p>
        ) : (
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>Gewinner</Th>
                  <Th>Gezogen</Th>
                  <Th>Prämie</Th>
                  <Th>Nachweis</Th>
                  <Th>Aktion</Th>
                </Tr>
              </Thead>
              <Tbody>
                {queue.map((z) => (
                  <QueueZeileView key={z.id} zeile={z} pending={pending} lauf={lauf} />
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
      </SectionCard>

      {/* ── Bisherige Gewinner ──────────────────────────────────────────────
          Betreiber kontaktiert und kauft manuell — also muss er sehen, wer
          schon dran war. Zugleich die Dubletten-Kontrolle: dieselbe Person mit
          einer ZWEITEN Nummer faellt hier am Namen auf, was kein
          Dedup-Schluessel leisten kann. */}
      {historie.length > 0 ? (
        <SectionCard
          title="Bisherige Gewinner"
          subtitle="Auch die Dubletten-Kontrolle: derselbe Name mit anderer Nummer fällt hier auf"
        >
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Telefon</Th>
                  <Th>Gezogen</Th>
                  <Th>Ergebnis</Th>
                  <Th>Gutschein</Th>
                </Tr>
              </Thead>
              <Tbody>
                {historie.map((h) => (
                  <Tr key={h.id}>
                    <Td>
                      <span className="font-semibold">{h.name}</span>
                      {h.email ? (
                        <span className="block text-body-xs text-claimondo-shield/60">
                          {h.email}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{h.telefon_normalisiert}</Td>
                    <Td>
                      {h.gezogen_am ? new Date(h.gezogen_am).toLocaleDateString('de-DE') : '—'}
                    </Td>
                    <Td>{h.status === 'bestaetigt' ? 'bestätigt' : 'abgelehnt'}</Td>
                    <Td>{h.gutschein_code ?? '—'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        </SectionCard>
      ) : null}

      {/* ── Kampagne ────────────────────────────────────────────────────── */}
      <SectionCard title="Kampagne">
        <form
          action={(fd) => lauf(() => speichereKampagne(fd), 'Kampagne gespeichert.')}
          className="space-y-4"
        >
          {aktive ? <input type="hidden" name="id" value={aktive.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Feld name="name" label="Name" defaultValue={aktive?.name ?? ''} required />
            <Feld
              name="start_am"
              label="Start"
              type="date"
              defaultValue={aktive?.start_am ?? ''}
              required
            />
            <Feld name="ende_am" label="Ende (optional)" type="date" defaultValue={aktive?.ende_am ?? ''} />
            <Feld
              name="preise_pro_tag"
              label="Preise pro Tag"
              type="number"
              defaultValue={String(aktive?.preise_pro_tag ?? 3)}
            />
            <Feld
              name="preis_betrag_eur"
              label="Betrag je Preis (€)"
              type="number"
              defaultValue={String(aktive?.preis_betrag_eur ?? 50)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Feld
              name="topbar_text"
              label="Topbar-Text"
              defaultValue={aktive?.topbar_text ?? ''}
              placeholder="Täglich 3 × 50 € Gutschein gewinnen"
            />
            <Feld
              name="topbar_cta_text"
              label="Topbar-Button"
              defaultValue={aktive?.topbar_cta_text ?? ''}
              placeholder="Jetzt teilnehmen"
            />
          </div>

          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              name="topbar_aktiv"
              defaultChecked={aktive?.topbar_aktiv ?? false}
              className="h-4 w-4 rounded-ios-sm"
            />
            Topbar auf allen Seiten anzeigen
          </label>

          <Button type="submit" loading={pending}>
            Kampagne speichern
          </Button>
        </form>

        {kampagnen.length > 0 ? (
          <div className="mt-6 border-t border-claimondo-border pt-4">
            <p className="mb-2 text-caption text-claimondo-shield/70">Alle Kampagnen</p>
            <ul className="space-y-2">
              {kampagnen.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 text-body-sm">
                  <span>
                    {k.name}{' '}
                    <span className="text-claimondo-shield/60">
                      ({k.start_am}
                      {k.ende_am ? ` bis ${k.ende_am}` : ''})
                    </span>
                  </span>
                  <Button
                    variant={k.aktiv ? 'ghost' : 'navy'}
                    loading={pending}
                    onClick={() =>
                      lauf(
                        () => setzeKampagneAktiv(k.id, !k.aktiv),
                        k.aktiv ? 'Kampagne pausiert.' : 'Kampagne aktiviert.',
                      )
                    }
                  >
                    {k.aktiv ? 'Pausieren' : 'Aktivieren'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      {/* ── Prämien ─────────────────────────────────────────────────────── */}
      <SectionCard title="Prämien zur Auswahl">
        {!aktive ? (
          <p className="text-body-sm text-claimondo-shield/70">
            Erst eine Kampagne anlegen und aktivieren.
          </p>
        ) : (
          <>
            <p className="mb-4 text-body-sm text-claimondo-shield/70">
              Diese Gutscheine stehen den Teilnehmern auf der Landingpage zur Auswahl. Ohne
              Prämien im Katalog kann niemand wählen.
            </p>

            {praemien.length > 0 ? (
              <ul className="mb-5 space-y-2">
                {praemien.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-ios-md border border-claimondo-border px-3 py-2 text-body-sm"
                  >
                    <span>
                      <strong>{p.name}</strong>
                      {p.beschreibung ? (
                        <span className="text-claimondo-shield/60"> — {p.beschreibung}</span>
                      ) : null}
                      {!p.aktiv ? (
                        <span className="text-claimondo-shield/60"> (inaktiv)</span>
                      ) : null}
                    </span>
                    <Button
                      variant="ghost"
                      loading={pending}
                      onClick={() => lauf(() => loeschePraemie(p.id), 'Prämie gelöscht.')}
                    >
                      Löschen
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <form
              action={(fd) => lauf(() => speicherePraemie(fd), 'Prämie gespeichert.')}
              className="space-y-4 border-t border-claimondo-border pt-4"
            >
              <input type="hidden" name="kampagne_id" value={aktive.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Feld name="name" label="Name" placeholder="Tanken & Laden" required />
                <Feld
                  name="beschreibung"
                  label="Wo einlösbar"
                  placeholder="ARAL, Esso, TotalEnergies, JET, GO, EnBW"
                />
                <Feld name="betrag_eur" label="Betrag (€)" type="number" defaultValue="50" />
                <Feld name="sortierung" label="Reihenfolge" type="number" defaultValue="0" />
              </div>
              <Button type="submit" loading={pending}>
                Prämie hinzufügen
              </Button>
            </form>
          </>
        )}
      </SectionCard>
    </div>
  )
}

function Kennzahl({ label, wert, hinweis }: { label: string; wert: number; hinweis: string }) {
  return (
    <div className="rounded-ios-md border border-claimondo-border p-3">
      <p className="text-heading-lg font-bold tabular-nums text-claimondo-navy">{wert}</p>
      <p className="text-body-sm font-semibold text-claimondo-navy">{label}</p>
      <p className="text-body-xs text-claimondo-shield/60">{hinweis}</p>
    </div>
  )
}

function QueueZeileView({
  zeile,
  pending,
  lauf,
}: {
  zeile: QueueZeile
  pending: boolean
  lauf: (fn: () => Promise<{ ok: boolean; error?: string }>, erfolg: string) => void
}) {
  const [code, setCode] = useState('')
  const [grund, setGrund] = useState('')

  return (
    <Tr>
      <Td>
        <span className="font-semibold">{zeile.name}</span>
        <a
          href={`tel:${zeile.telefon_normalisiert}`}
          className="block text-body-xs text-claimondo-ondo underline"
        >
          {zeile.telefon_normalisiert}
        </a>
        {zeile.email ? (
          <span className="block text-body-xs text-claimondo-shield/60">{zeile.email}</span>
        ) : null}
      </Td>
      <Td>{zeile.gezogen_am ? new Date(zeile.gezogen_am).toLocaleDateString('de-DE') : '—'}</Td>
      <Td>{zeile.praemieName ?? <span className="text-claimondo-shield/60">keine Wahl</span>}</Td>
      <Td>
        {zeile.nachweisUrl ? (
          // Signierter Link, 30 Minuten gueltig. Ohne ihn stuende hier nur
          // "hochgeladen" — pruefen kann man das nicht.
          <a
            href={zeile.nachweisUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-claimondo-ondo underline"
          >
            Nachweis öffnen
          </a>
        ) : (
          <span className="text-claimondo-shield/60">fehlt</span>
        )}
      </Td>
      <Td>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Gutschein-Code"
              className="w-40 rounded-ios-sm border border-claimondo-border px-2 py-1 text-body-sm"
            />
            <Button
              loading={pending}
              onClick={() =>
                lauf(() => bestaetigeNachweis(zeile.id, code), 'Bestätigt, Gutschein vermerkt.')
              }
            >
              Bestätigen
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              placeholder="Grund (optional)"
              className="w-40 rounded-ios-sm border border-claimondo-border px-2 py-1 text-body-sm"
            />
            <Button
              variant="ghost"
              loading={pending}
              onClick={() => lauf(() => lehneNachweisAb(zeile.id, grund), 'Abgelehnt.')}
            >
              Ablehnen
            </Button>
          </div>
        </div>
      </Td>
    </Tr>
  )
}

type FeldProps = React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string }
function Feld({ name, label, ...rest }: FeldProps) {
  const id = `gs-admin-${name}`
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-caption text-claimondo-shield">
        {label}
      </label>
      <input
        id={id}
        name={name}
        {...rest}
        className="w-full rounded-ios-md border border-claimondo-border px-3 py-2 text-body-sm focus:border-claimondo-ondo focus:outline-none"
      />
    </div>
  )
}
