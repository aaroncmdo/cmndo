'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/primitives'
import { InvitationStatusBadge } from '@/components/claims/InvitationStatusBadge'
import { inviteGegnerViaAirdrop, type InviteGegnerResult } from '@/lib/airdrop/server-actions'

interface Props {
  claim_id: string
  hint?: {
    nachname?: string
    firma?: string
    kennzeichen?: string
    telefon?: string
  }
  open: boolean
  onClose: () => void
}

export function InviteGegnerModal({ claim_id, hint, open, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<InviteGegnerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || result) return
    generateLink()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function generateLink() {
    setLoading(true)
    setError(null)
    try {
      const r = await inviteGegnerViaAirdrop({
        claim_id,
        invited_via: 'manual_link',
        party_data_hint: hint,
      })
      if (!r.ok) {
        setError(translateError(r.error))
        return
      }
      setResult(r)

      // QR-Code server-seitig nicht rendert — via dynamic import
      const QRCode = (await import('qrcode')).default
      const svg = await QRCode.toString(r.magic_link_url, { type: 'svg', margin: 1, width: 280 })
      setQrSvg(svg)
    } catch (e: unknown) {
      setError(translateError(e instanceof Error ? e.message : 'UNBEKANNT'))
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose()
      // State beim Schließen zurücksetzen für nächste Öffnung
      setResult(null)
      setQrSvg(null)
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gegner zum Schadens-Flow einladen</DialogTitle>
          <DialogDescription>
            Senden Sie dem Gegner einen Link, damit er seine Daten direkt zu Ihrem
            Schaden hinzufügen kann. Vorteile: bessere Argumente bei der Regulierung,
            konsistente Hergangsschilderung, schnellere Bearbeitung.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-muted-foreground">
            Magic-Link wird generiert...
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <Tabs defaultValue="qr">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="qr">📷 QR-Code</TabsTrigger>
                <TabsTrigger value="airdrop">📤 AirDrop</TabsTrigger>
                <TabsTrigger value="whatsapp">💬 WhatsApp</TabsTrigger>
                {result.share_payload.sms_url && (
                  <TabsTrigger value="sms">📱 SMS</TabsTrigger>
                )}
                <TabsTrigger value="email">📧 E-Mail</TabsTrigger>
                <TabsTrigger value="link">🔗 Link</TabsTrigger>
              </TabsList>

              <TabsContent value="qr" className="mt-4">
                <div className="flex flex-col items-center gap-3">
                  {qrSvg ? (
                    <div
                      className="rounded-lg overflow-hidden border"
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                    />
                  ) : (
                    <div className="w-[280px] h-[280px] bg-muted rounded-lg animate-pulse" />
                  )}
                  <p className="text-sm text-muted-foreground text-center">
                    Halten Sie das Display dem Gegner hin. Code gültig bis{' '}
                    <strong>{new Date(result.expires_at).toLocaleDateString('de-DE')}</strong>.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="airdrop" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Tippen Sie auf &quot;Teilen&quot; und wählen Sie den Gegner aus dem AirDrop-Menü
                  oder einer anderen App.
                </p>
                <Button
                  tone="navy"
                  onPress={async () => {
                    if (typeof navigator !== 'undefined' && navigator.share) {
                      try {
                        await navigator.share({
                          title: 'Schadens-Erfassung',
                          text: result.share_payload.airdrop_text,
                          url: result.magic_link_url,
                        })
                      } catch { /* User hat Teilen abgebrochen */ }
                    } else {
                      await copyToClipboard(result.magic_link_url)
                    }
                  }}
                >
                  📤 Teilen
                </Button>
              </TabsContent>

              <TabsContent value="whatsapp" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Öffnet einen vorausgefüllten WhatsApp-Chat mit dem Link.
                </p>
                <a
                  href={result.share_payload.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#25D366] hover:brightness-95 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  💬 In WhatsApp öffnen
                </a>
              </TabsContent>

              {result.share_payload.sms_url && (
                <TabsContent value="sms" className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Öffnet eine vorausgefüllte SMS-Nachricht.
                  </p>
                  <a
                    href={result.share_payload.sms_url}
                    className="inline-flex items-center gap-2 bg-claimondo-ondo hover:bg-claimondo-navy text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    📱 SMS öffnen
                  </a>
                </TabsContent>
              )}

              <TabsContent value="email" className="mt-4 space-y-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Betreff: </span>
                  <strong>{result.share_payload.email_subject}</strong>
                </div>
                <pre className="whitespace-pre-wrap bg-muted p-3 rounded-md text-sm text-left overflow-auto max-h-48">
                  {result.share_payload.email_body}
                </pre>
                <Button
                  tone="ghost"
                  onPress={() => copyToClipboard(
                    result.share_payload.email_subject + '\n\n' + result.share_payload.email_body
                  )}
                >
                  {copied ? '✓ Kopiert' : 'Text kopieren'}
                </Button>
              </TabsContent>

              <TabsContent value="link" className="mt-4 space-y-3">
                <code className="block bg-muted p-3 rounded-md text-sm break-all">
                  {result.magic_link_url}
                </code>
                <Button
                  tone="ghost"
                  onPress={() => copyToClipboard(result.magic_link_url)}
                >
                  {copied ? '✓ Kopiert' : '🔗 Link kopieren'}
                </Button>
              </TabsContent>
            </Tabs>

            <div className="border-t pt-3 text-sm text-muted-foreground flex items-center gap-2">
              <span>Status:</span>
              <InvitationStatusBadge
                invitation_id={result.invitation_id}
                initialStatus="offen"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function translateError(code: string): string {
  switch (code) {
    case 'RATE_LIMIT_5_PRO_CLAIM':
      return 'Es gibt bereits 5 offene Einladungen für diesen Schaden. Wenn der Gegner nicht reagiert, kontaktieren Sie ihn anders.'
    case 'RATE_LIMIT_20_PRO_USER_PRO_TAG':
      return 'Sie haben heute bereits 20 Einladungen versendet. Bitte morgen wieder versuchen.'
    case 'CLAIM_NICHT_MEHR_OFFEN':
      return 'Dieser Schaden ist bereits abgeschlossen — keine Einladungen mehr möglich.'
    case 'KEINE_BERECHTIGUNG_FUER_EINLADUNG':
      return 'Sie können nur Einladungen für eigene Schäden generieren.'
    case 'CLAIM_NICHT_GEFUNDEN':
      return 'Schaden nicht gefunden.'
    default:
      return 'Es ist ein Fehler aufgetreten. Bitte später erneut versuchen.'
  }
}
