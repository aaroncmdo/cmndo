'use client'

import { useState, useTransition } from 'react'
import {
  vsReguliertVoll, vsKuerzt, vsLehntAb, vsBrauchtMehrZeit, vsWillNachbesichtigung,
  ruegeAkzeptiert, ruegeAbgelehnt, techStellungnahmeFreigeben,
  zahlungEingegangen, schlussabrechnungErstellt,
  klageEingeleitet, fallStornieren, asVersandManuell,
} from '../vs-regulierung-actions'
import { CheckCircleIcon, AlertTriangleIcon, XCircleIcon, ClockIcon, EyeIcon, BanknoteIcon, ScaleIcon, GavelIcon, FileTextIcon, ShieldAlertIcon, SendIcon } from 'lucide-react'

type VsFall = {
  id: string
  status: string
  versicherung_name: string | null
  anschlussschreiben_am: string | null
  vs_reaktion_typ: string | null
  vs_reaktion_am: string | null
  vs_ablehnungsgrund: string | null
  vs_frist_bis: string | null
  regulierung_betrag: number | null
  kuerzungs_betrag: number | null
  ruege_counter: number | null
  ruege_gesendet_am: string | null
  ruege_betrag: number | null
  zahlung_betrag: number | null
  zahlung_eingegangen_am: string | null
  schlussabrechnung_am: string | null
  vs_eskalationsstufe: string | null
  schadenhoehe_netto: number | null
  gutachten_betrag: number | null
  ist_totalschaden: boolean | null
  zahlungsweg: string | null
  technische_stellungnahme_status: string | null
  nachbesichtigung_konfrontation: boolean | null
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export default function VsRegulierungTab({ fall }: { fall: VsFall }) {
  const [pending, startTransition] = useTransition()
  const [modal, setModal] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // Form states
  const [betrag, setBetrag] = useState('')
  const [originalBetrag, setOriginalBetrag] = useState(String(fall.gutachten_betrag ?? fall.schadenhoehe_netto ?? ''))
  const [anerkanntBetrag, setAnerkanntBetrag] = useState('')
  const [grund, setGrund] = useState('')
  const [fristBis, setFristBis] = useState('')
  const [details, setDetails] = useState('')
  const [zahlDatum, setZahlDatum] = useState(new Date().toISOString().slice(0, 10))
  const [zahlBetrag, setZahlBetrag] = useState(String(fall.regulierung_betrag ?? ''))
  const [klageNotiz, setKlageNotiz] = useState('')
  const [stornoGrund, setStornoGrund] = useState('')
  const [zahlungsweg, setZahlungsweg] = useState<string>(fall.zahlungsweg ?? 'kundenkonto')
  const [asDatum, setAsDatum] = useState(new Date().toISOString().slice(0, 10))
  const [konfrontation, setKonfrontation] = useState(fall.nachbesichtigung_konfrontation ?? false)

  function handle(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn()
        setModal(null)
        setToast('Gespeichert')
        setTimeout(() => setToast(''), 2000)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Fehler')
        setTimeout(() => setToast(''), 4000)
      }
    })
  }

  const isAS = fall.status === 'anschlussschreiben'
  const isRegLaeuft = fall.status === 'regulierung-laeuft' || fall.status === 'regulierung'
  const isZahlung = fall.status === 'zahlung-eingegangen'
  const isAbgelehnt = fall.status === 'vs-abgelehnt'
  const isAbgeschlossen = fall.status === 'abgeschlossen'
  const tageSeithAS = fall.anschlussschreiben_am ? daysSince(fall.anschlussschreiben_am) : null

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`text-xs font-medium px-3 py-2 rounded-lg ${toast === 'Gespeichert' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ScaleIcon className="w-4 h-4 text-[#4573A2]" />
          Versicherungs-Regulierung {fall.versicherung_name ? `— ${fall.versicherung_name}` : ''}
        </h2>

        {/* Status-Timeline */}
        <div className="mt-4 flex items-center gap-2 text-xs flex-wrap">
          {fall.anschlussschreiben_am && (
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              AS versendet {new Date(fall.anschlussschreiben_am).toLocaleDateString('de-DE')}
            </span>
          )}
          {fall.vs_reaktion_typ && (
            <span className="text-gray-400">→</span>
          )}
          {fall.vs_reaktion_typ && (
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              fall.vs_reaktion_typ === 'voll_reguliert' ? 'bg-green-50 text-green-700' :
              fall.vs_reaktion_typ === 'gekuerzt' ? 'bg-amber-50 text-amber-700' :
              fall.vs_reaktion_typ === 'abgelehnt' ? 'bg-red-50 text-red-700' :
              fall.vs_reaktion_typ === 'mehr_zeit' ? 'bg-gray-50 text-gray-600' :
              'bg-violet-50 text-violet-700'
            }`}>
              {({ voll_reguliert: 'Voll reguliert', gekuerzt: 'Gekürzt', abgelehnt: 'Abgelehnt', mehr_zeit: 'Mehr Zeit', nachbesichtigung: 'Nachbesichtigung' } as Record<string, string>)[fall.vs_reaktion_typ] ?? fall.vs_reaktion_typ}
              {fall.vs_reaktion_am && ` (${new Date(fall.vs_reaktion_am).toLocaleDateString('de-DE')})`}
            </span>
          )}
          {fall.zahlung_eingegangen_am && (
            <>
              <span className="text-gray-400">→</span>
              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                Zahlung {new Date(fall.zahlung_eingegangen_am).toLocaleDateString('de-DE')}
              </span>
            </>
          )}
        </div>

        {/* Eskalations-Anzeige */}
        {tageSeithAS !== null && isAS && (
          <div className={`mt-3 text-xs font-medium px-3 py-2 rounded-lg ${tageSeithAS > 14 ? 'bg-red-50 text-red-700' : tageSeithAS > 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
            Tag {tageSeithAS} seit Anschlussschreiben {tageSeithAS > 14 && '— Eskalation fällig!'}
            {fall.vs_eskalationsstufe && ` · Stufe: ${fall.vs_eskalationsstufe}`}
          </div>
        )}
      </div>

      {/* ═══ Totalschaden-Badge ═══ */}
      {fall.ist_totalschaden && (
        <div className="bg-red-100 rounded-xl border border-red-300 p-4 flex items-center gap-3">
          <ShieldAlertIcon className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm font-semibold text-red-800">Totalschaden — Fahrzeug ist wirtschaftlicher Totalschaden</p>
        </div>
      )}

      {/* ═══ Tech. Stellungnahme Card (wenn beauftragt/hochgeladen) ═══ */}
      {fall.technische_stellungnahme_status && fall.technische_stellungnahme_status !== 'nicht_benoetigt' && (
        <div className="bg-violet-50 rounded-xl border border-violet-200 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-violet-800 uppercase flex items-center gap-2">
            <FileTextIcon className="w-4 h-4" /> Technische Stellungnahme
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            fall.technische_stellungnahme_status === 'beauftragt' ? 'bg-amber-100 text-amber-800' :
            fall.technische_stellungnahme_status === 'hochgeladen' ? 'bg-blue-100 text-blue-800' :
            fall.technische_stellungnahme_status === 'freigegeben' ? 'bg-green-100 text-green-800' :
            'bg-red-100 text-red-800'
          }`}>
            {({ beauftragt: 'SV arbeitet dran (72h SLA)', hochgeladen: 'KB-Freigabe ausstehend', freigegeben: 'Freigegeben → Kanzlei', abgelehnt: 'Abgelehnt' } as Record<string, string>)[fall.technische_stellungnahme_status] ?? fall.technische_stellungnahme_status}
          </span>
          {fall.technische_stellungnahme_status === 'hochgeladen' && (
            <button disabled={pending} onClick={() => handle(() => techStellungnahmeFreigeben(fall.id))} className="w-full px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              Plausibilitäts-Check bestanden — Freigeben
            </button>
          )}
        </div>
      )}

      {/* ═══ AS manuell eintragen (wenn kanzlei-uebergeben aber kein AS) ═══ */}
      {fall.status === 'kanzlei-uebergeben' && !fall.anschlussschreiben_am && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
            <SendIcon className="w-4 h-4" /> AS-Versand manuell eintragen
          </h3>
          <input type="date" value={asDatum} onChange={e => setAsDatum(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button disabled={pending} onClick={() => handle(() => asVersandManuell(fall.id, asDatum))} className="w-full px-4 py-2 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#3a6290] disabled:opacity-50">
            Anschlussschreiben als versendet markieren
          </button>
        </div>
      )}

      {/* ═══ Phase A: VS-Reaktion Actions (nur wenn AS gesendet) ═══ */}
      {isAS && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">VS-Reaktion eintragen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <ActionBtn icon={CheckCircleIcon} label="VS reguliert voll" cls="bg-green-600 text-white hover:bg-green-700" onClick={() => setModal('voll')} disabled={pending} />
            <ActionBtn icon={AlertTriangleIcon} label="VS kürzt" cls="bg-amber-600 text-white hover:bg-amber-700" onClick={() => setModal('kuerzt')} disabled={pending} />
            <ActionBtn icon={XCircleIcon} label="VS lehnt ab" cls="bg-red-600 text-white hover:bg-red-700" onClick={() => setModal('ablehnt')} disabled={pending} />
            <ActionBtn icon={ClockIcon} label="Mehr Zeit" cls="border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => setModal('mehrzeit')} disabled={pending} />
            <ActionBtn icon={EyeIcon} label="Nachbesichtigung" cls="border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => setModal('nachbesichtigung')} disabled={pending} />
          </div>
        </div>
      )}

      {/* ═══ Rüge-Card (wenn VS gekürzt hat) ═══ */}
      {fall.vs_reaktion_typ === 'gekuerzt' && isRegLaeuft && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-amber-800 uppercase flex items-center gap-2">
            <GavelIcon className="w-4 h-4" /> Rüge-Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] text-amber-600 uppercase">Kürzung</p><p className="font-bold text-amber-900">{fall.kuerzungs_betrag ? fmt(fall.kuerzungs_betrag as number) : '—'}</p></div>
            <div><p className="text-[10px] text-amber-600 uppercase">Anerkannt</p><p className="font-bold text-amber-900">{fall.regulierung_betrag ? fmt(fall.regulierung_betrag as number) : '—'}</p></div>
            <div><p className="text-[10px] text-amber-600 uppercase">Rüge-Counter</p><p className="font-bold text-amber-900">{fall.ruege_counter ?? 0}x</p></div>
            <div><p className="text-[10px] text-amber-600 uppercase">Letzte Rüge</p><p className="font-bold text-amber-900">{fall.ruege_gesendet_am ? new Date(fall.ruege_gesendet_am).toLocaleDateString('de-DE') : '—'}</p></div>
          </div>
          <div className="flex gap-2 pt-2">
            <button disabled={pending} onClick={() => handle(() => ruegeAkzeptiert(fall.id))} className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              Nachforderung akzeptiert
            </button>
            <button disabled={pending} onClick={() => handle(() => ruegeAbgelehnt(fall.id))} className="flex-1 px-3 py-2 rounded-lg border border-red-300 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50">
              Nachforderung abgelehnt
            </button>
          </div>
        </div>
      )}

      {/* ═══ Phase B: Zahlungseingang (wenn regulierung-laeuft) ═══ */}
      {isRegLaeuft && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
            <BanknoteIcon className="w-4 h-4" /> Zahlungseingang
          </h3>
          <ActionBtn icon={BanknoteIcon} label="Zahlungseingang eintragen" cls="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setModal('zahlung')} disabled={pending} />
        </div>
      )}

      {/* ═══ Phase B: Schlussabrechnung (wenn zahlung-eingegangen) ═══ */}
      {isZahlung && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-emerald-800 uppercase">Zahlung eingegangen</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] text-emerald-600 uppercase">Betrag</p><p className="font-bold">{fall.zahlung_betrag ? fmt(fall.zahlung_betrag as number) : '—'}</p></div>
            <div><p className="text-[10px] text-emerald-600 uppercase">Datum</p><p className="font-bold">{fall.zahlung_eingegangen_am ? new Date(fall.zahlung_eingegangen_am).toLocaleDateString('de-DE') : '—'}</p></div>
          </div>
          <button disabled={pending} onClick={() => handle(() => schlussabrechnungErstellt(fall.id))} className="w-full px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50">
            Schlussabrechnung erstellt → Fall abschließen
          </button>
        </div>
      )}

      {/* ═══ Phase C: VS-Ablehnung (wenn vs-abgelehnt) ═══ */}
      {isAbgelehnt && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-5 space-y-4">
          <h3 className="text-xs font-semibold text-red-800 uppercase">Versicherung hat abgelehnt</h3>
          <div className="text-sm">
            <p className="text-[10px] text-red-600 uppercase">Ablehnungsgrund</p>
            <p className="font-medium text-red-900">{fall.vs_ablehnungsgrund || '—'}</p>
            {fall.vs_reaktion_am && <p className="text-xs text-red-400 mt-1">{new Date(fall.vs_reaktion_am).toLocaleDateString('de-DE')}</p>}
          </div>
          <p className="text-xs text-red-600 bg-red-100 px-3 py-2 rounded-lg">
            Klage-Prozess läuft vollständig über LexDrive. Claimondo trackt nur den Status.
          </p>
          <div className="flex gap-2">
            <button disabled={pending} onClick={() => setModal('klage')} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
              Klage eingeleitet (LexDrive)
            </button>
            <button disabled={pending} onClick={() => setModal('storno')} className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50">
              Fall stornieren
            </button>
          </div>
        </div>
      )}

      {/* ═══ Abgeschlossen ═══ */}
      {isAbgeschlossen && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-500">Fall abgeschlossen {fall.schlussabrechnung_am && `am ${new Date(fall.schlussabrechnung_am).toLocaleDateString('de-DE')}`}</p>
        </div>
      )}

      {/* Kein relevanter Status */}
      {!isAS && !isRegLaeuft && !isZahlung && !isAbgelehnt && !isAbgeschlossen && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-400">VS-Regulierung wird aktiv sobald das Anschlussschreiben gesendet wurde.</p>
        </div>
      )}

      {/* ═══ Modals ═══ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>

            {modal === 'voll' && (<>
              <h3 className="font-semibold text-gray-900">VS reguliert vollständig</h3>
              <label className="block text-xs text-gray-500">Regulierungsbetrag (EUR)</label>
              <input type="number" step="0.01" value={betrag} onChange={e => setBetrag(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="z.B. 3500.00" autoFocus />
              <ModalActions disabled={pending || !betrag} onCancel={() => setModal(null)} onConfirm={() => handle(() => vsReguliertVoll(fall.id, parseFloat(betrag)))} label="Regulierung eintragen" />
            </>)}

            {modal === 'kuerzt' && (<>
              <h3 className="font-semibold text-gray-900">VS kürzt Regulierung</h3>
              <label className="block text-xs text-gray-500">Ursprünglicher Betrag</label>
              <input type="number" step="0.01" value={originalBetrag} onChange={e => setOriginalBetrag(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <label className="block text-xs text-gray-500">Anerkannter Betrag</label>
              <input type="number" step="0.01" value={anerkanntBetrag} onChange={e => setAnerkanntBetrag(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="z.B. 2800.00" autoFocus />
              {originalBetrag && anerkanntBetrag && <p className="text-xs text-amber-700 font-medium">Kürzung: {fmt(parseFloat(originalBetrag) - parseFloat(anerkanntBetrag))}</p>}
              <ModalActions disabled={pending || !originalBetrag || !anerkanntBetrag} onCancel={() => setModal(null)} onConfirm={() => handle(() => vsKuerzt(fall.id, parseFloat(originalBetrag), parseFloat(anerkanntBetrag)))} label="Kürzung eintragen" />
            </>)}

            {modal === 'ablehnt' && (<>
              <h3 className="font-semibold text-gray-900">VS lehnt Regulierung ab</h3>
              <label className="block text-xs text-gray-500">Ablehnungsgrund</label>
              <textarea value={grund} onChange={e => setGrund(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm h-24" placeholder="Grund der Ablehnung..." autoFocus />
              <ModalActions disabled={pending || !grund} onCancel={() => setModal(null)} onConfirm={() => handle(() => vsLehntAb(fall.id, grund))} label="Ablehnung eintragen" cls="bg-red-600 hover:bg-red-700" />
            </>)}

            {modal === 'mehrzeit' && (<>
              <h3 className="font-semibold text-gray-900">VS benötigt mehr Zeit</h3>
              <label className="block text-xs text-gray-500">Neue Frist</label>
              <input type="date" value={fristBis} onChange={e => setFristBis(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" autoFocus />
              <ModalActions disabled={pending || !fristBis} onCancel={() => setModal(null)} onConfirm={() => handle(() => vsBrauchtMehrZeit(fall.id, fristBis))} label="Frist eintragen" />
            </>)}

            {modal === 'nachbesichtigung' && (<>
              <h3 className="font-semibold text-gray-900">VS fordert Nachbesichtigung</h3>
              <label className="block text-xs text-gray-500">Details</label>
              <textarea value={details} onChange={e => setDetails(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm h-24" placeholder="Was soll nachbesichtigt werden?" autoFocus />
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer" onClick={() => setKonfrontation(!konfrontation)}>
                <input type="checkbox" checked={konfrontation} onChange={() => setKonfrontation(!konfrontation)} className="w-4 h-4 rounded border-gray-300 text-[#4573A2]" />
                Konfrontationstermin — unser SV soll dabei sein
              </label>
              <ModalActions disabled={pending} onCancel={() => setModal(null)} onConfirm={() => handle(() => vsWillNachbesichtigung(fall.id, details, konfrontation))} label="Task erstellen" />
            </>)}

            {modal === 'zahlung' && (<>
              <h3 className="font-semibold text-gray-900">Zahlungseingang eintragen</h3>
              <label className="block text-xs text-gray-500">Betrag (EUR)</label>
              <input type="number" step="0.01" value={zahlBetrag} onChange={e => setZahlBetrag(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" autoFocus />
              <label className="block text-xs text-gray-500">Datum</label>
              <input type="date" value={zahlDatum} onChange={e => setZahlDatum(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <label className="block text-xs text-gray-500">Zahlungsweg</label>
              <select value={zahlungsweg} onChange={e => setZahlungsweg(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="kundenkonto">Auf Kundenkonto</option>
                <option value="werkstatt_direkt">Direkt an Werkstatt</option>
              </select>
              <ModalActions disabled={pending || !zahlBetrag} onCancel={() => setModal(null)} onConfirm={() => handle(() => zahlungEingegangen(fall.id, parseFloat(zahlBetrag), zahlDatum, zahlungsweg))} label="Zahlung eintragen" cls="bg-emerald-600 hover:bg-emerald-700" />
            </>)}

            {modal === 'klage' && (<>
              <h3 className="font-semibold text-gray-900">Klage eingeleitet (LexDrive)</h3>
              <label className="block text-xs text-gray-500">Notiz</label>
              <textarea value={klageNotiz} onChange={e => setKlageNotiz(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm h-24" placeholder="Aktenzeichen, Anwalt, etc." autoFocus />
              <ModalActions disabled={pending} onCancel={() => setModal(null)} onConfirm={() => handle(() => klageEingeleitet(fall.id, klageNotiz))} label="In Timeline eintragen" />
            </>)}

            {modal === 'storno' && (<>
              <h3 className="font-semibold text-red-700">Fall stornieren</h3>
              <p className="text-xs text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
              <label className="block text-xs text-gray-500">Grund</label>
              {/* AAR-91: Standard-Gruende */}
              <select value={stornoGrund} onChange={e => setStornoGrund(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" autoFocus>
                <option value="">Bitte wählen</option>
                <option value="Kunde wollte nicht">Kunde wollte nicht</option>
                <option value="Doppel-Lead">Doppel-Lead</option>
                <option value="Falsche Daten">Falsche Daten</option>
                <option value="Fahrer war schuld">Fahrer war schuld</option>
                <option value="Schaden zu klein">Schaden zu klein</option>
                <option value="__freitext__">Anderer Grund …</option>
              </select>
              {stornoGrund === '__freitext__' && (
                <input type="text" autoFocus onChange={e => setStornoGrund(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mt-2" placeholder="Bitte Grund angeben" />
              )}
              <ModalActions disabled={pending || !stornoGrund || stornoGrund === '__freitext__'} onCancel={() => setModal(null)} onConfirm={() => handle(() => fallStornieren(fall.id, stornoGrund))} label="Endgültig stornieren" cls="bg-red-600 hover:bg-red-700" />
            </>)}

          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon: Icon, label, cls, onClick, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; cls: string; onClick: () => void; disabled: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function ModalActions({ disabled, onCancel, onConfirm, label, cls }: { disabled: boolean; onCancel: () => void; onConfirm: () => void; label: string; cls?: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50">Abbrechen</button>
      <button disabled={disabled} onClick={onConfirm} className={`flex-1 px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${cls ?? 'bg-[#4573A2] hover:bg-[#3a6290]'}`}>{label}</button>
    </div>
  )
}
