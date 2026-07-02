'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WrenchIcon, PlusIcon, KeyIcon, QrCodeIcon, CopyIcon, CheckIcon, Layers3Icon, Trash2Icon, MailIcon } from 'lucide-react'
import { createWerkstatt, sendWerkstattLoginMail } from './actions'
import { werkstattQrSvg } from './qr-action'
import { getWerkstattStaffel, setWerkstattStaffel } from './staffel-actions'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { TextField } from '@/components/shared/forms/TextField'
import { QrCodeDownloadButtons } from '@/components/shared/QrCodeDownloadButtons'

type Werkstatt = {
  id: string
  name: string
  adresse_ort: string | null
  adresse_plz: string | null
  status: string | null
  provision_betrag_netto: number | null
  aktiviert_am: string | null
  email: string | null
  telefon: string | null
}

const STATUS_LABELS: Record<string, string> = {
  aktiv: 'Aktiv',
  inaktiv: 'Inaktiv',
  gesperrt: 'Gesperrt',
}

const STATUS_COLORS: Record<string, string> = {
  aktiv: 'bg-success-soft text-success-strong',
  inaktiv: 'bg-claimondo-bg text-claimondo-ondo',
  gesperrt: 'bg-danger-soft text-danger-strong',
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function WerkstaettenClient({ werkstaetten }: { werkstaetten: Werkstatt[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; werkstattId: string } | null>(null)
  const [loginMailLoadingId, setLoginMailLoadingId] = useState<string | null>(null)
  const [dialogMailSending, setDialogMailSending] = useState(false)

  // QR-Code-Anzeige pro Werkstatt (regulaerer Kunden-QR /start/werkstatt/<id>)
  const [qr, setQr] = useState<{ name: string; url: string; svg: string } | null>(null)
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)

  // Staffelung pro Werkstatt (Meilenstein-Boni)
  const [staffelFor, setStaffelFor] = useState<Werkstatt | null>(null)
  const [staffelRows, setStaffelRows] = useState<{ schwelle: string; bonus: string }[]>([])
  const [staffelLoadingId, setStaffelLoadingId] = useState<string | null>(null)
  const [staffelSaving, setStaffelSaving] = useState(false)

  // Adress-State fuer GooglePlaceAutocomplete → hidden form fields
  const [adresse, setAdresse] = useState<{
    strasse: string
    plz: string
    ort: string
    lat: number | null
    lng: number | null
    display: string
  }>({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })

  function handlePlaceSelect(result: PlaceResult) {
    setAdresse({
      strasse: result.strasse,
      plz: result.plz,
      ort: result.stadt,
      lat: result.lat,
      lng: result.lng,
      display: result.adresse,
    })
  }

  function openDialog() {
    setAdresse({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })
    setCreatedCredentials(null)
    setShowDialog(true)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    // Inject address fields from state (GooglePlaceAutocomplete doesn't render hidden inputs itself)
    fd.set('adresse_strasse', adresse.strasse)
    fd.set('adresse_plz', adresse.plz)
    fd.set('adresse_ort', adresse.ort)
    fd.set('lat', adresse.lat !== null ? String(adresse.lat) : '')
    fd.set('lng', adresse.lng !== null ? String(adresse.lng) : '')

    try {
      const result = await createWerkstatt(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCreatedCredentials({ email: result.email, password: result.password, werkstattId: result.werkstattId })
      toast.success(`Werkstatt angelegt: ${result.email}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function sendLoginMail(w: Werkstatt) {
    setLoginMailLoadingId(w.id)
    try {
      const res = await sendWerkstattLoginMail(w.id)
      if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
      toast.success(`Login-Mail gesendet an ${w.email ?? 'die Werkstatt'}`)
    } finally {
      setLoginMailLoadingId(null)
    }
  }

  async function sendDialogLoginMail() {
    if (!createdCredentials) return
    setDialogMailSending(true)
    try {
      const res = await sendWerkstattLoginMail(createdCredentials.werkstattId, createdCredentials.password)
      if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
      toast.success(`Login-Mail gesendet an ${createdCredentials.email}`)
    } finally {
      setDialogMailSending(false)
    }
  }

  async function openQr(w: Werkstatt) {
    setQrLoadingId(w.id)
    try {
      const res = await werkstattQrSvg(w.id)
      if (!res.ok) { toast.error(res.error); return }
      setQr({ name: res.name, url: res.url, svg: res.svg })
      setCopiedUrl(false)
    } finally {
      setQrLoadingId(null)
    }
  }

  function copyQrUrl(text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    })
  }

  function qrFileBase(name: string) {
    const slug = name.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return `claimondo-werkstatt-${slug || 'qr'}-qr`
  }

  async function openStaffel(w: Werkstatt) {
    setStaffelLoadingId(w.id)
    try {
      const res = await getWerkstattStaffel(w.id)
      if (!res.ok) { toast.error(res.error); return }
      setStaffelRows(res.stufen.map((s) => ({ schwelle: String(s.schwelle), bonus: String(s.bonus_betrag_netto) })))
      setStaffelFor(w)
    } finally {
      setStaffelLoadingId(null)
    }
  }

  function addStaffelRow() {
    setStaffelRows((rows) => [...rows, { schwelle: '', bonus: '' }])
  }

  function removeStaffelRow(i: number) {
    setStaffelRows((rows) => rows.filter((_, idx) => idx !== i))
  }

  function updateStaffelRow(i: number, field: 'schwelle' | 'bonus', val: string) {
    setStaffelRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)))
  }

  async function saveStaffel() {
    if (!staffelFor) return
    setStaffelSaving(true)
    try {
      const stufen = staffelRows
        .filter((r) => r.schwelle.trim() !== '')
        .map((r) => ({ schwelle: Number(r.schwelle), bonus_betrag_netto: Number(r.bonus || 0) }))
      const res = await setWerkstattStaffel(staffelFor.id, stufen)
      if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
      toast.success('Staffelung gespeichert.')
      setStaffelFor(null)
      router.refresh()
    } finally {
      setStaffelSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        <div className="mb-6">
          <PageHeader
            title="Werkstätten"
            description={`${werkstaetten.length} Partnerwerk${werkstaetten.length === 1 ? 'statt' : 'stätten'}`}
            icon={WrenchIcon}
            actions={
              <Button
                variant="navy"
                onClick={openDialog}
                iconLeft={<PlusIcon className="w-4 h-4" />}
              >
                Neue Werkstatt
              </Button>
            }
          />
        </div>

        <DataTableContainer variant="plain" className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden">
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Name</Th>
                <Th className="text-left text-claimondo-ondo!">Ort</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Provision (netto)</Th>
                <Th className="text-left text-claimondo-ondo!">Aktiviert am</Th>
                <Th className="text-left text-claimondo-ondo!">QR</Th>
                <Th className="text-left text-claimondo-ondo!">Staffelung</Th>
                <Th className="text-left text-claimondo-ondo!">Login-Mail</Th>
              </Tr>
            </Thead>
            <Tbody className="divide-y-0!">
              {werkstaetten.map(w => (
                <Tr
                  key={w.id}
                  className="border-b border-claimondo-border/50"
                >
                  <Td>
                    <div className="text-claimondo-navy font-medium">{w.name}</div>
                    <div className="text-claimondo-ondo text-xs">{w.email ?? '—'}</div>
                  </Td>
                  <Td>
                    <div className="text-claimondo-navy text-sm">{w.adresse_ort ?? '—'}</div>
                    {w.adresse_plz && <div className="text-claimondo-ondo text-xs">{w.adresse_plz}</div>}
                  </Td>
                  <Td>
                    {w.status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[w.status] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>
                        {STATUS_LABELS[w.status] ?? w.status}
                      </span>
                    ) : (
                      <span className="text-claimondo-ondo/70 text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-claimondo-navy text-sm tabular-nums">
                      {w.provision_betrag_netto !== null ? `${w.provision_betrag_netto} €` : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{formatDatum(w.aktiviert_am)}</span>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={qrLoadingId === w.id}
                      onClick={() => openQr(w)}
                      iconLeft={<QrCodeIcon className="w-4 h-4" />}
                    >
                      QR
                    </Button>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={staffelLoadingId === w.id}
                      onClick={() => openStaffel(w)}
                      iconLeft={<Layers3Icon className="w-4 h-4" />}
                    >
                      Staffel
                    </Button>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={loginMailLoadingId === w.id}
                      onClick={() => sendLoginMail(w)}
                      iconLeft={<MailIcon className="w-4 h-4" />}
                    >
                      Senden
                    </Button>
                  </Td>
                </Tr>
              ))}
              {werkstaetten.length === 0 && (
                <Tr>
                  <Td colSpan={8} className="py-12! text-center text-claimondo-ondo!">
                    Noch keine Werkstätten angelegt.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

        <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={520} ariaLabel="Neue Werkstatt">
          {createdCredentials ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyIcon className="w-5 h-5 text-success-strong" />
                <h2 className="text-claimondo-navy font-semibold text-lg">Werkstatt angelegt</h2>
              </div>
              <p className="text-claimondo-ondo text-sm">
                Zugangsdaten einmalig anzeigen — bitte sofort an die Werkstatt weitergeben.
              </p>
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4 space-y-2">
                <div>
                  <p className="text-xs text-claimondo-ondo mb-0.5">E-Mail</p>
                  <p className="text-claimondo-navy font-medium text-sm select-all">{createdCredentials.email}</p>
                </div>
                <div>
                  <p className="text-xs text-claimondo-ondo mb-0.5">Passwort (einmalig)</p>
                  <p className="text-claimondo-navy font-mono font-medium text-sm select-all">{createdCredentials.password}</p>
                </div>
              </div>
              <p className="text-xs text-claimondo-ondo">
                Das Passwort wird dem Nutzer beim ersten Login zur Änderung aufgefordert.
              </p>
              <Button
                variant="navy"
                fullWidth
                loading={dialogMailSending}
                onClick={sendDialogLoginMail}
                iconLeft={<MailIcon className="w-4 h-4" />}
              >
                Login-Mail an Werkstatt senden
              </Button>
              <Button variant="ghost" fullWidth onClick={() => { setCreatedCredentials(null); setShowDialog(false) }}>
                Schließen
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Neue Werkstatt</h2>
              <form onSubmit={handleCreate} className="space-y-3">
                <TextField
                  label="Name der Werkstatt"
                  name="name"
                  required
                  placeholder="z.B. Auto-Service Müller GmbH"
                />
                <TextField
                  label="E-Mail (Login)"
                  name="email"
                  type="email"
                  required
                  placeholder="werkstatt@beispiel.de"
                />
                <TextField
                  label="Telefon (optional)"
                  name="telefon"
                  type="tel"
                  placeholder="+49 221 …"
                />
                <TextField
                  label="Ansprechpartner / Geschäftsführer (optional)"
                  name="ansprechpartner_name"
                  placeholder="z.B. Max Mustermann"
                />
                <div>
                  <label className="text-sm text-claimondo-ondo mb-1 block">Standort</label>
                  <GooglePlaceAutocomplete
                    placeholder="Adresse der Werkstatt eingeben…"
                    onSelect={handlePlaceSelect}
                    defaultValue={adresse.display}
                  />
                  {adresse.lat !== null && (
                    <p className="text-xs text-claimondo-ondo mt-1">
                      {adresse.strasse}, {adresse.plz} {adresse.ort} — Koordinaten gespeichert
                    </p>
                  )}
                </div>
                <TextField
                  label="Provision (netto, €)"
                  name="provision_betrag_netto"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={150}
                />
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" fullWidth onClick={() => setShowDialog(false)}>
                    Abbrechen
                  </Button>
                  <Button
                    variant="navy"
                    fullWidth
                    type="submit"
                    loading={loading}
                    disabled={loading || adresse.lat === null}
                  >
                    Anlegen
                  </Button>
                </div>
              </form>
            </>
          )}
        </Modal>

        <Modal open={qr !== null} onClose={() => setQr(null)} maxWidth={420} ariaLabel="Werkstatt-QR-Code">
          {qr && (
            <div className="space-y-4">
              <h2 className="text-claimondo-navy font-semibold text-lg">QR-Code — {qr.name}</h2>
              <p className="text-claimondo-ondo text-sm">
                Kunden scannen diesen Code und gelangen direkt zum Schadenmelde-Einstieg dieser Werkstatt.
              </p>
              <div
                className="flex items-center justify-center p-6 rounded-ios-xl bg-claimondo-bg border border-claimondo-border"
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />
              <div>
                <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">Einstiegs-Link</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    readOnly
                    value={qr.url}
                    className="flex-1 font-mono text-sm text-claimondo-navy bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2.5 truncate"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="navy"
                    size="sm"
                    onClick={() => copyQrUrl(qr.url)}
                    iconLeft={copiedUrl ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
                  >
                    {copiedUrl ? 'Kopiert' : 'Kopieren'}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-xs text-claimondo-ondo">Zum Aushängen / Drucken:</span>
                <QrCodeDownloadButtons qrSvg={qr.svg} fileBaseName={qrFileBase(qr.name)} />
              </div>
            </div>
          )}
        </Modal>

        <Modal open={staffelFor !== null} onClose={() => setStaffelFor(null)} maxWidth={520} ariaLabel="Staffelung bearbeiten">
          {staffelFor && (
            <div className="space-y-4">
              <div>
                <h2 className="text-claimondo-navy font-semibold text-lg">Staffelung — {staffelFor.name}</h2>
                <p className="mt-0.5 text-claimondo-ondo text-sm">
                  Meilenstein-Boni: ab X freigegebenen Vermittlungen ein Einmal-Bonus.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-claimondo-ondo">
                  <span className="flex-1">ab … Kunden</span>
                  <span className="flex-1">Bonus (netto, €)</span>
                  <span className="w-11 shrink-0" />
                </div>
                {staffelRows.length === 0 && (
                  <p className="px-1 text-sm text-claimondo-ondo/70">Noch keine Stufen — füge eine hinzu.</p>
                )}
                {staffelRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={r.schwelle}
                      onChange={(e) => updateStaffelRow(i, 'schwelle', e.target.value)}
                      placeholder="z.B. 10"
                      className="flex-1 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={r.bonus}
                      onChange={(e) => updateStaffelRow(i, 'bonus', e.target.value)}
                      placeholder="z.B. 500"
                      className="flex-1 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      ariaLabel="Stufe entfernen"
                      onClick={() => removeStaffelRow(i)}
                      iconLeft={<Trash2Icon width={15} height={15} />}
                    />
                  </div>
                ))}
              </div>

              <Button variant="ghost" size="sm" onClick={addStaffelRow} iconLeft={<PlusIcon className="w-4 h-4" />}>
                Stufe hinzufügen
              </Button>

              <div className="flex gap-3 pt-2">
                <Button variant="ghost" fullWidth onClick={() => setStaffelFor(null)}>
                  Abbrechen
                </Button>
                <Button variant="navy" fullWidth loading={staffelSaving} onClick={saveStaffel}>
                  Speichern
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  )
}
