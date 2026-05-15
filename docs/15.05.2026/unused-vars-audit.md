# Unused-Vars Audit — staging-HEAD 2026-05-15

Generated from `npx eslint src --format json` + heuristic classification.
Total: **207** unused-vars in src/. Distribution:

- **local**: 110
- **import**: 56
- **param**: 26
- **useState**: 12
- **useRouter**: 2
- **callback**: 1

## local (110)

_Lokale Variable ungenutzt — heterogen, braucht manuelle Triage_

| File:Line | Variable | Code |
|---|---|---|
| `src/app/admin/finance/(hub)/page.tsx:571` | `key` | `const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`` |
| `src/app/admin/meine-tasks/MyTasksClient.tsx:36` | `isAdmin` | `assigned, created, isAdmin,` |
| `src/app/admin/sachverstaendige/[id]/page.tsx:63` | `bewertung` | `const bewertung = bewertungRow ?? null` |
| `src/app/admin/sachverstaendige/anlegen/AkademieAnlegenWizard.tsx:13` | `paketAnzahlung` | `PAKET_KONFIG, paketAnzahlung, ANREDE_OPTIONEN, TITEL_OPTIONEN,` |
| `src/app/admin/sachverstaendige/anlegen/AkademieAnlegenWizard.tsx:14` | `SCHADENARTEN` | `QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN,` |
| `src/app/admin/statistiken/StatistikenClient.tsx:11` | `Tbody` | `Table, Thead, Tbody, Tr, ClickableTr, Th, Td, DataTableContainer,` |
| `src/app/admin/vertraege/VertragseditorClient.tsx:184` | `aspect` | `const aspect = pdfSize.height / pdfSize.width` |
| `src/app/api/auth/callback/route.ts:15` | `next` | `const next = searchParams.get('next')` |
| `src/app/api/auth/google/disconnect/route.ts:9` | `req` | `export async function POST(req: NextRequest) {` |
| `src/app/api/cron/gutachter-erinnerungen/route.ts:6` | `getOsrmDuration` | `async function getOsrmDuration(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<{ minutes: numbe` |
| `src/app/api/ocr/zb1-scan/route.ts:87` | `halterUpdate` | `const halterUpdate =` |
| `src/app/api/support/chat/route.ts:32` | `DURCHDENKEN_MAX_TURNS` | `const DURCHDENKEN_MAX_TURNS = 8` |
| `src/app/api/twilio/inbound-kb-whatsapp/route.ts:84` | `kundenName` | `kundenName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') \|\| 'Kunde'` |
| `src/app/dispatch/leads/[id]/SvDispatchPanel.tsx:100` | `kalenderOpen` | `const [kalenderOpen, setKalenderOpen] = useState(false)` |
| `src/app/dispatch/leads/[id]/SvDispatchPanel.tsx:100` | `setKalenderOpen` | `const [kalenderOpen, setKalenderOpen] = useState(false)` |
| `src/app/dispatch/leads/[id]/_phases/BkatAnalysePanel.tsx:111` | `topTbnr` | `const topTbnr = data?.vorschlaege?.[0]` |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:384` | `saveToggle` | `saveToggle,` |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:386` | `lead_ref` | `lead_ref,` |
| `src/app/dispatch/leads/_components/LeadsViewToggle.tsx:89` | `rowPadCls` | `const rowPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'` |
| `src/app/dispatch/leads/_components/LeadsViewToggle.tsx:108` | `wa` | `const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)` |
| `src/app/dispatch/leads/_components/LeadsViewToggle.tsx:198` | `wa` | `const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)` |
| `src/app/dispatch/rueckrufe/RueckrufListItem.tsx:34` | `terminId` | `export default function RueckrufListItem({ terminId, startZeit, notizen, isNew, lead, defaultOpen = false }: Props) {` |
| `src/app/dispatch/rueckrufe/page.tsx:40` | `openParam` | `const openParam = sp.open ?? null` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:19` | `ShieldCheckIcon` | `ShieldCheckIcon,` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:20` | `AlertTriangleIcon` | `AlertTriangleIcon,` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:21` | `ExternalLinkIcon` | `ExternalLinkIcon,` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:137` | `LegalDocsProp` | `type LegalDocsProp = {` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:165` | `svRechtsakzeptanz` | `const [svRechtsakzeptanz, setSvRechtsakzeptanz] = useState(false)` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:165` | `setSvRechtsakzeptanz` | `const [svRechtsakzeptanz, setSvRechtsakzeptanz] = useState(false)` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:183` | `accountPassword` | `const [accountPassword, setAccountPassword] = useState('')` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:200` | `kundenName` | `const kundenName = [editVorname, editNachname].filter(Boolean).join(' ')` |
| `src/app/flow/[token]/error.tsx:4` | `_error` | `export default function FlowError({ error: _error }: { error: Error }) {` |
| `src/app/gutachter/GutachterShell.tsx:8` | `MapIcon` | `MapIcon,` |
| `src/app/gutachter/GutachterShell.tsx:19` | `InboxIcon` | `InboxIcon,` |
| `src/app/gutachter/GutachterShell.tsx:20` | `EuroIcon` | `EuroIcon,` |
| `src/app/gutachter/einstellungen/kalender/KalenderEinstellungenClient.tsx:34` | `_svId` | `svId: _svId,` |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:204` | `pflichtdokumente` | `pflichtdokumente,` |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:230` | `visibleSections` | `const visibleSections = getVisibleFallSections(fall, 'sv', {` |
| `src/app/gutachter/feldmodus/FeldmodusMap.tsx:20` | `MAPBOX_STYLE_STANDARD` | `MAPBOX_STYLE_STANDARD,` |
| `src/app/gutachter/heute/actions.ts:19` | `origin` | `origin?: { lat: number; lng: number } \| null,` |
| `src/app/gutachter/kalender/page.tsx:122` | `claimondoTermineByStart` | `const claimondoTermineByStart = (faelle ?? [])` |
| `src/app/gutachter/onboarding/buero/BueroOnboardingClient.tsx:16` | `startBueroStripeCheckout` | `startBueroStripeCheckout,` |
| `src/app/gutachter/onboarding/buero/BueroOnboardingClient.tsx:56` | `_userId` | `userId: _userId,` |
| `src/app/gutachter/profil/ProfilClient.tsx:831` | `ROW_INPUT_CLS` | `const ROW_INPUT_CLS =` |
| `src/app/gutachter/tasks/page.tsx:51` | `heute` | `const heute = offeneTasks.filter(t => {` |
| `src/app/gutachter/termine/[id]/navigation/NavigationClient.tsx:28` | `fallId` | `fallId,` |
| `src/app/gutachter/termine/[id]/navigation/NavigationClient.tsx:38` | `setEta` | `const [eta, setEta] = useState<number \| null>(initialEta)` |
| `src/app/gutachter/termine/[id]/vor-ort/VorOrtClient.tsx:123` | `err` | `} catch (err) {` |
| `src/app/kunde/_components/GutachterCard.tsx:50` | `telefon` | `telefon,` |
| `src/app/kunde/_components/GutachterCard.tsx:76` | `cardRect` | `const [cardRect, setCardRect] = useState<{ top: number; bottom: number; right: number } \| null>(null)` |
| `src/app/kunde/_components/GutachterCard.tsx:85` | `measure` | `const measure = () => {` |
| `src/app/kunde/_components/KundenbetreuerCard.tsx:50` | `telefon` | `telefon,` |
| `src/app/kunde/_components/KundenbetreuerCard.tsx:76` | `cardRect` | `const [cardRect, setCardRect] = useState<{ top: number; bottom: number; right: number } \| null>(null)` |
| `src/app/kunde/_components/KundenbetreuerCard.tsx:76` | `setCardRect` | `const [cardRect, setCardRect] = useState<{ top: number; bottom: number; right: number } \| null>(null)` |
| `src/app/kunde/faelle/[id]/FallDetailSections.tsx:33` | `_fallId` | `async function markNachrichtenGelesen(_fallId: string): Promise<void> {` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:12` | `UploadCloudIcon` | `CheckIcon, UploadCloudIcon, CalendarIcon, FileTextIcon, SparklesIcon, FolderOpenIcon,` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:13` | `ClockIcon` | `AlertCircleIcon, ClockIcon, RefreshCwIcon, InfoIcon, XIcon, CameraIcon,` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:20` | `setzeVorschadenAbrechnung` | `setzeVorschadenAbrechnung,` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:23` | `VorschadenAbrechnungsStatus` | `type VorschadenAbrechnungsStatus,` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:45` | `STEPS` | `const STEPS = [` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:55` | `KATEGORIE_LABELS` | `const KATEGORIE_LABELS: Record<string, { label: string; emoji: string }> = {` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:65` | `KATEGORIE_REIHENFOLGE` | `const KATEGORIE_REIHENFOLGE = [` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:80` | `LEGACY_DOKTYP_LABELS` | `const LEGACY_DOKTYP_LABELS: Record<string, string> = {` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:162` | `STATUS_PHASES` | `const STATUS_PHASES = [` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:213` | `uploadingId` | `const [uploadingId, setUploadingId] = useState<string \| null>(null)` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:222` | `slotCounts` | `const [slotCounts, setSlotCounts] = useState<Record<string, number>>(` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:225` | `uploadingSlot` | `const [uploadingSlot, setUploadingSlot] = useState<string \| null>(null)` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:254` | `zb1Result` | `const [zb1Result, setZb1Result] = useState<{` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:304` | `fileCountOverride` | `const [fileCountOverride, setFileCountOverride] = useState<Record<string, number>>({})` |
| `src/app/sv/termin/[token]/TerminClient.tsx:11` | `APP_URL` | `const APP_URL = process.env.NEXT_PUBLIC_APP_URL \|\| 'https://cmndo.vercel.app'` |
| `src/components/admin/fallakte/KanzleiPaketModal.tsx:14` | `PaketTyp` | `type PaketTyp,` |
| `src/components/chat/MultiChannelChat.tsx:273` | `labelCls` | `labelCls = 'text-claimondo-ondo'` |
| `src/components/chat/MultiChannelChat.tsx:275` | `bubbleCls` | `bubbleCls = 'bg-white border border-claimondo-border text-claimondo-navy'` |
| `src/components/chat/MultiChannelChat.tsx:277` | `timeCls` | `timeCls = 'text-claimondo-ondo/70'` |
| `src/components/chat/MultiChannelChat.tsx:282` | `showRolleLabel` | `const showRolleLabel = !isOwnMsg && !!message.sender_rolle` |
| `src/components/faelle/FallActivityFeed.tsx:6` | `PhoneIcon` | `CheckCircleIcon, PhoneIcon, MailIcon, UploadIcon, ClockIcon,` |
| `src/components/faelle/FallActivityFeed.tsx:6` | `MailIcon` | `CheckCircleIcon, PhoneIcon, MailIcon, UploadIcon, ClockIcon,` |
| `src/components/faelle/FallActivityFeed.tsx:6` | `UploadIcon` | `CheckCircleIcon, PhoneIcon, MailIcon, UploadIcon, ClockIcon,` |
| `src/components/faelle/FallDokumenteSidebar.tsx:34` | `onUploadClick` | `onUploadClick,` |
| `src/components/fall/StammdatenAccordion.tsx:10` | `FileTextIcon` | `FileTextIcon,` |
| `src/components/fall/StammdatenAccordion.tsx:13` | `AlertTriangleIcon` | `AlertTriangleIcon,` |
| `src/components/fall/StammdatenDetail.tsx:15` | `AlertTriangleIcon` | `AlertTriangleIcon,` |
| `src/components/kunde/ClaimStepper.tsx:65` | `notices` | `notices,` |
| `src/components/kunde/ClaimSummary.tsx:23` | `GaugeIcon` | `GaugeIcon,` |
| `src/components/kunde/FallKarte.tsx:134` | `_lastUpdate` | `lastUpdate: _lastUpdate,` |
| `src/components/kunde/KanzleiPfadCard.tsx:50` | `gutachtenUrl` | `gutachtenUrl,` |
| `src/components/landing/LandingHero.tsx:17` | `PHONE_TEL` | `const PHONE_TEL = '+4922125906530'` |
| `src/components/onboarding/fields/SlotField.tsx:21` | `anfrageId` | `export function SlotField({ feld, value, onChange, disabled, svId, svLeadId, anfrageId }: Props) {` |
| `src/components/primitives/Modal/Modal.web.tsx:45` | `portalTarget` | `const portalTarget = svRoot ?? document.body` |
| `src/components/shared/NeueTermineBadge.tsx:34` | `_userId` | `userId: _userId,` |
| `src/components/shared/claims/EndzustandDropdown.tsx:13` | `ScaleIcon` | `ScaleIcon,` |
| `src/components/shared/claims/timeline-event-mappings.ts:12` | `UserCheckIcon` | `UserCheckIcon,` |
| `src/components/shared/fall-mitteilungen/FallMitteilungenBanner.tsx:18` | `CheckCircle2Icon` | `CheckCircle2Icon,` |
| `src/components/shared/fall-mitteilungen/FallMitteilungenBanner.tsx:19` | `ClockIcon` | `ClockIcon,` |
| `src/lib/abrechnung/calculate-lead-price.ts:56` | `monthEnd` | `const monthEnd = new Date(caseCreatedAt.getFullYear(), caseCreatedAt.getMonth() + 1, 1)` |
| `src/lib/actions/storno-actions.ts:279` | `db` | `const db = createAdminClient()` |
| `src/lib/actions/termin-actions.ts:141` | `terminId` | `terminId,` |
| `src/lib/actions/termin-actions.ts:287` | `terminId` | `terminId,` |
| `src/lib/actions/termin-actions.ts:359` | `neueEndZeit` | `const neueEndZeit = new Date(neueStartZeit.getTime() + TERMIN_DAUER_MS)` |
| `src/lib/actions/termin-actions.ts:560` | `terminId` | `terminId,` |
| `src/lib/actions/termin-actions.ts:767` | `terminId` | `terminId,` |
| `src/lib/actions/termin-actions.ts:769` | `source` | `source,` |
| `src/lib/airdrop/server-actions.ts:357` | `_ip` | `_ip: string,` |
| `src/lib/dokumente/create-pflicht.ts:28` | `fall` | `fall?: Record<string, unknown> \| null,` |
| `src/lib/email/google/flows.ts:529` | `monat` | `const monat = abr.abrechnungs_zeitraum_start.slice(0, 7)` |
| `src/lib/email/google/templates/ReklamationFristAbgelaufen.tsx:11` | `_p` | `export function subject(_p: Props) {` |
| `src/lib/email/google/templates/SvPortalFreigeschaltet.tsx:12` | `_p` | `export function subject(_p: Props) {` |
| `src/lib/email/google/templates/TwoFactorCode.tsx:16` | `_p` | `export function subject(_p: Props) {` |
| `src/lib/lexdrive/process-event.ts:490` | `_payload` | `_payload: LexDriveEventPayload,` |
| `src/scripts/seed-test-data.ts:199` | `morgen` | `const morgen = new Date(Date.now() + 86400000).toISOString()` |

## import (56)

_Import ungenutzt — meistens harmlos, manchmal Hinweis dass Helper geplant war_

| File:Line | Variable | Code |
|---|---|---|
| `src/app/admin/_components/TageskalenderWidget.tsx:3` | `ClockIcon` | `import { ClockIcon, CalendarIcon, UserIcon } from 'lucide-react'` |
| `src/app/admin/_components/TageskalenderWidget.tsx:3` | `UserIcon` | `import { ClockIcon, CalendarIcon, UserIcon } from 'lucide-react'` |
| `src/app/admin/kalender/KalenderClient.tsx:11` | `ClipboardListIcon` | `import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ClipboardListIcon, PhoneIcon, UsersIcon, CoffeeIcon, XIcon, Ch` |
| `src/app/admin/sachverstaendige/[id]/page.tsx:12` | `GoogleBewertungBadge` | `import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'` |
| `src/app/admin/sachverstaendige/anlegen/BueroAnlegenWizard.tsx:11` | `SCHADENARTEN` | `import { PAKET_KONFIG, paketAnzahlung, ANREDE_OPTIONEN, TITEL_OPTIONEN, QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN, ` |
| `src/app/admin/sachverstaendige/anlegen/SoloAnlegenWizard.tsx:17` | `SCHADENARTEN` | `import { PAKET_KONFIG, paketAnzahlung, paketKontingent, QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN, ANREDE_OPTIONEN,` |
| `src/app/admin/sachverstaendige/loading.tsx:1` | `LoadingSkeleton` | `import LoadingSkeleton from '@/components/shared/LoadingSkeleton'` |
| `src/app/admin/versicherungen/VersicherungenClient.tsx:5` | `PhoneIcon` | `import { SearchIcon, PhoneIcon, MailIcon, GlobeIcon, PlusIcon, XIcon } from 'lucide-react'` |
| `src/app/api/ocr-gutachten/route.ts:3` | `berechneLeadpreis` | `import { berechneLeadpreis } from '@/lib/leadpreis'` |
| `src/app/api/sv-zuweisung/route.ts:12` | `sendNachricht` | `import { sendNachricht } from '@/lib/whatsapp/send'` |
| `src/app/dispatch/leads/[id]/_phases/Phase2TerminServiceTyp.tsx:16` | `CheckCircleIcon` | `import { CheckCircle2Icon, CheckCircleIcon, ScaleIcon, CalendarIcon, MapPinIcon } from 'lucide-react'` |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:31` | `DokumenteAnfordernCard` | `import DokumenteAnfordernCard from './DokumenteAnfordernCard'` |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:39` | `parseKennzeichen` | `import { parseKennzeichen, buildKennzeichen } from '@/lib/format/kennzeichen'` |
| `src/app/dispatch/leads/_components/LeadsViewToggle.tsx:13` | `Chip` | `import { Chip } from '@/components/ui/Chip'` |
| `src/app/dispatch/leads/_components/LeadsViewToggle.tsx:15` | `DensityToggle` | `import DensityToggle from '@/components/shared/DensityToggle'` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:12` | `useCallback` | `import { useState, useRef, useCallback, useEffect } from 'react'` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:28` | `GoogleBewertungBadge` | `import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'` |
| `src/app/gutachter/GutachterShell.tsx:29` | `SupportButton` | `import { SupportButton } from '@/components/support/SupportButton'` |
| `src/app/gutachter/einstellungen/kalender/caldav-actions.ts:18` | `CalDavProviderId` | `import { findProvider, type CalDavProviderId } from '@/lib/kalender/caldav/provider-presets'` |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:42` | `useState` | `import { useState } from 'react'` |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:49` | `SvEinzuholenBanner` | `import SvEinzuholenBanner from '@/components/gutachter/SvEinzuholenBanner'` |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:53` | `SvToolsCard` | `import { SvToolsCard } from './_components/SvToolsCard'` |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:63` | `AnforderungenListe` | `import AnforderungenListe, {` |
| `src/app/gutachter/fall/[id]/page.tsx:16` | `BriefingCard` | `import BriefingCard from '@/components/fall/BriefingCard'` |
| `src/app/gutachter/fall/[id]/page.tsx:17` | `SvEinzuholenBanner` | `import SvEinzuholenBanner from '@/components/gutachter/SvEinzuholenBanner'` |
| `src/app/gutachter/gebiet/page.tsx:6` | `LayersIcon` | `import { MapPinIcon, UsersIcon, FlameIcon, ArrowUpIcon, XIcon, SendIcon, EyeIcon, LayersIcon } from 'lucide-react'` |
| `src/app/gutachter/kalender/page.tsx:6` | `EmptyState` | `import EmptyState from '@/components/shared/EmptyState'` |
| `src/app/gutachter/profil/ProfilClient.tsx:4` | `toast` | `import { toast } from 'sonner'` |
| `src/app/gutachter/reklamationen/ReklamationenClient.tsx:6` | `ShieldCheckIcon` | `import { PlusIcon, XIcon, ShieldCheckIcon, AlertCircleIcon } from 'lucide-react'` |
| `src/app/gutachter/termine/[id]/navigation/NavigationClient.tsx:6` | `NavigationIcon` | `import { NavigationIcon, MapPinIcon, ClockIcon, CheckIcon, AlertCircleIcon } from 'lucide-react'` |
| `src/app/kfz-gutachter/kosten/page.tsx:3` | `Euro` | `import { ChevronRight, Phone, Euro, ShieldCheck, FileText, AlertTriangle } from 'lucide-react'` |
| `src/app/kfz-gutachter/kosten/page.tsx:3` | `FileText` | `import { ChevronRight, Phone, Euro, ShieldCheck, FileText, AlertTriangle } from 'lucide-react'` |
| `src/app/kunde/_components/GutachterCard.tsx:10` | `PhoneIcon` | `import { PhoneIcon, MessageSquareIcon, XIcon } from 'lucide-react'` |
| `src/app/kunde/_components/GutachterCard.tsx:10` | `MessageSquareIcon` | `import { PhoneIcon, MessageSquareIcon, XIcon } from 'lucide-react'` |
| `src/app/kunde/_components/KundeKbChat.tsx:14` | `ChevronDownIcon` | `import { SendIcon, FileTextIcon, ChevronDownIcon, XIcon, ChevronRightIcon } from 'lucide-react'` |
| `src/app/kunde/_components/KundenbetreuerCard.tsx:11` | `MessageSquareIcon` | `import { PhoneIcon, MessageSquareIcon, VideoIcon, XIcon } from 'lucide-react'` |
| `src/app/kunde/termin/[token]/KundeTrackingClient.tsx:4` | `ClockIcon` | `import { MapPinIcon, ClockIcon, CheckCircleIcon, CarIcon, RefreshCwIcon, XCircleIcon, CalendarIcon, MapIcon } from 'luci` |
| `src/app/kunde/termin/[token]/KundeTrackingClient.tsx:4` | `XCircleIcon` | `import { MapPinIcon, ClockIcon, CheckCircleIcon, CarIcon, RefreshCwIcon, XCircleIcon, CalendarIcon, MapIcon } from 'luci` |
| `src/app/makler/partner-werden/page.tsx:3` | `Clock` | `import { Handshake, TrendingUp, Users, ChevronRight, Euro, Clock, Shield, CheckCircle2, Phone } from 'lucide-react'` |
| `src/app/sv/termin/[token]/TerminClient.tsx:7` | `terminAnnehmen` | `import { terminAblehnen, terminGegenvorschlag, terminAnnehmen } from '@/lib/actions/termin-actions'` |
| `src/components/ChatChannel.tsx:4` | `ImageIcon` | `import { SendIcon, ImageIcon } from 'lucide-react'` |
| `src/components/faelle/FallDokumenteSidebar.tsx:4` | `CircleDotIcon` | `import { CheckCircle2Icon, CircleDotIcon, AlertCircleIcon, FileTextIcon, ImageIcon, UploadIcon } from 'lucide-react'` |
| `src/components/kunde/BankdatenBanner.tsx:4` | `CheckCircleIcon` | `import { BanknoteIcon, CheckCircleIcon } from 'lucide-react'` |
| `src/components/offline/OutboxBadge.tsx:6` | `CheckCircleIcon` | `import { CloudUploadIcon, XIcon, RefreshCwIcon, CheckCircleIcon, AlertCircleIcon, ClockIcon, AlertTriangleIcon } from 'l` |
| `src/components/shared/claims/KanzleiWunschModal.tsx:16` | `toast` | `import { toast } from 'sonner'` |
| `src/components/shared/fall-mitteilungen/FallMitteilungenBanner.tsx:23` | `Card` | `import { Card, Stack, Row, Text, Icon } from '@/components/primitives'` |
| `src/components/shared/fall-mitteilungen/FallMitteilungenBanner.tsx:23` | `Icon` | `import { Card, Stack, Row, Text, Icon } from '@/components/primitives'` |
| `src/lib/actions/admin-kalender.ts:4` | `revalidatePath` | `import { revalidatePath } from 'next/cache'` |
| `src/lib/actions/dispatch-fall-actions.ts:13` | `triggerOnboardingTasks` | `import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerLeadTasks` |
| `src/lib/actions/dispatch-fall-actions.ts:13` | `resolveGates` | `import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerLeadTasks` |
| `src/lib/autoPhase.ts:2` | `triggerGutachtenUploadTask` | `import { triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerKanzleiPaketTask, triggerAsSended` |
| `src/lib/dokumente/create-pflicht.ts:14` | `berechneErwartung` | `import { berechneErwartung } from './erwartung'` |
| `src/lib/email/google/templates/SvAbrechnung.tsx:3` | `InfoTable` | `import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL, NAVY } from './layout'` |
| `src/lib/email/google/templates/SvAbrechnung.tsx:3` | `Divider` | `import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL, NAVY } from './layout'` |
| `src/lib/pdf/kanzlei-paket.tsx:4` | `Font` | `import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'` |
| `src/lib/resolver/resolve-tasks-from-event.ts:9` | `TaskSpec` | `import { EVENT_TO_TASK, type TaskSpec } from './event-to-task-map'` |

## param (26)

_Function-Parameter ungenutzt — oft OK (Interface-Konformität), manchmal vergessen-zu-nutzen_

| File:Line | Variable | Code |
|---|---|---|
| `src/app/admin/faelle/(hub)/FaelleKanban.tsx:88` | `timeSince` | `function timeSince(d: string): string {` |
| `src/app/api/cron/abrechnung-kanzlei-reminder/route.ts:41` | `kanzleiName` | `bodyFn: ({ kanzleiName, ansprechpartner, rechnungsnummer, brutto, faelligAm, magicUrl }) =>` |
| `src/app/dispatch/dashboard/page.tsx:91` | `leadIdForTask` | `function leadIdForTask(t: { lead_id: string \| null; fall_id: string \| null }): string \| null {` |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:1448` | `CardentityTypAButton` | `function CardentityTypAButton({` |
| `src/app/dispatch/leads/_components/NeuLeadDrawer.tsx:57` | `handleClick` | `function handleClick() {` |
| `src/app/gutachter/kalender/SVKalenderClient.tsx:54` | `findMatchingFallId` | `function findMatchingFallId(` |
| `src/app/gutachter/kalender/SVKalenderClient.tsx:202` | `HOURS` | `const HOURS = Array.from({ length: 11 }, (_, i) => i + 7) // 7:00-17:00` |
| `src/app/gutachter/profil/ProfilClient.tsx:494` | `_svId` | `function BrandingSection({ svId: _svId }: { svId: string }) {` |
| `src/app/gutachter/profil/ProfilClient.tsx:514` | `svId` | `function TerminAnfrage({ termin, svId }: { termin: PendingTermin; svId: string }) {` |
| `src/app/gutachter/profil/ProfilClient.tsx:811` | `inferInputMode` | `function inferInputMode(type: string): 'text' \| 'tel' \| 'email' \| 'numeric' \| 'decimal' \| undefined {` |
| `src/app/gutachter/profil/ProfilClient.tsx:818` | `inferAutoComplete` | `function inferAutoComplete(type: string, label: string): string \| undefined {` |
| `src/app/gutachter/profil/ProfilClient.tsx:834` | `EditRow` | `function EditRow({ label, name, defaultValue, type = 'text', placeholder }: {` |
| `src/app/kunde/faelle/[id]/FallDetailSections.tsx:41` | `fmt` | `function fmt(val: string \| null): string {` |
| `src/app/kunde/faelle/[id]/FallDetailSections.tsx:45` | `fmtDateTime` | `function fmtDateTime(val: string \| null): string {` |
| `src/app/kunde/faelle/[id]/FallDetailSections.tsx:225` | `InfoRow` | `function InfoRow({ label, value }: { label: string; value: string }) {` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:310` | `handleFilesUpload` | `function handleFilesUpload(dokId: string, files: FileList \| File[]) {` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:365` | `handleFreiUpload` | `function handleFreiUpload(slotId: string \| null, file: File, beschreibung?: string) {` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:423` | `pflichtBlockedSlots` | `const pflichtBlockedSlots = pflichtSlots.filter((s) => s.pflicht && s.status !== 'erfuellt')` |
| `src/app/kunde/termin/[token]/KundeTrackingClient.tsx:267` | `toLocalInput` | `const toLocalInput = (d: Date) => {` |
| `src/components/kunde/ClaimSummary.tsx:292` | `CarRender` | `function CarRender({` |
| `src/components/landing/HauptseiteClient.tsx:518` | `main` | `].map(({ key, val, main, accent }) => (` |
| `src/components/termine/TerminListeClient.tsx:167` | `onRueckrufClick` | `function Gruppe({ label, rows, muted, dispatchLinks, onRueckrufClick }: { label: string; rows: Normalized[]; muted?: boo` |
| `src/lib/kalender/sync-to-cache.ts:60` | `i` | `return diffAndApply(db, svId, 'google', busy.map((b, i) => ({` |
| `src/lib/leads/__tests__/convert-lead-to-claim.test.ts:128` | `primeHappyPathResponses` | `function primeHappyPathResponses(lead: Record<string, unknown>) {` |
| `src/lib/support/__tests__/rate-limit.test.ts:36` | `_table` | `from: (_table: string) => {` |
| `src/lib/termine/verlegung-vorschlaege.ts:431` | `diffTage` | `function diffTage(target: Date): number {` |

## useState (12)

_useState-Setter ungenutzt — oft Bug (State sollte updated werden, fehlt aber)_

| File:Line | Variable | Code |
|---|---|---|
| `src/app/admin/sachverstaendige/anlegen/AkademieAnlegenWizard.tsx:82` | `setSchadenarten` | `const [schadenarten, setSchadenarten] = useState<string[]>([])` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:166` | `svWiderrufOffen` | `const [svWiderrufOffen, setSvWiderrufOffen] = useState(false)` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:166` | `setSvWiderrufOffen` | `const [svWiderrufOffen, setSvWiderrufOffen] = useState(false)` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:167` | `svDatenschutzOffen` | `const [svDatenschutzOffen, setSvDatenschutzOffen] = useState(false)` |
| `src/app/flow/[token]/FlowWizardKfz.tsx:167` | `setSvDatenschutzOffen` | `const [svDatenschutzOffen, setSvDatenschutzOffen] = useState(false)` |
| `src/app/gutachter/profil/ProfilClient.tsx:75` | `showEmptyFields` | `const [showEmptyFields, setShowEmptyFields] = useState(false)` |
| `src/app/gutachter/profil/ProfilClient.tsx:75` | `setShowEmptyFields` | `const [showEmptyFields, setShowEmptyFields] = useState(false)` |
| `src/app/gutachter/vertrag/page.tsx:21` | `drawing` | `const [drawing, setDrawing] = useState(false)` |
| `src/app/gutachter/vertrag/page.tsx:21` | `setDrawing` | `const [drawing, setDrawing] = useState(false)` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:226` | `sonstigesBeschreibung` | `const [sonstigesBeschreibung, setSonstigesBeschreibung] = useState('')` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:227` | `sonstigesCount` | `const [sonstigesCount, setSonstigesCount] = useState(0)` |
| `src/app/kunde/onboarding/OnboardingWizard.tsx:228` | `sonstigesError` | `const [sonstigesError, setSonstigesError] = useState<string \| null>(null)` |

## useRouter (2)

_useRouter() ungenutzt — oft fehlende Navigation/Refresh-Logic_

| File:Line | Variable | Code |
|---|---|---|
| `src/app/admin/faelle/(hub)/FaelleKanban.tsx:232` | `router` | `const router = useRouter()` |
| `src/app/gutachter/onboarding/buero/BueroOnboardingClient.tsx:66` | `router` | `const router = useRouter()` |

## callback (1)

_useCallback/useMemo ungenutzt — oft Refactor-Rest, kann Performance-Loss sein_

| File:Line | Variable | Code |
|---|---|---|
| `src/app/admin/statistiken/StatistikenClient.tsx:187` | `klassMap` | `const klassMap = useMemo(() => {` |
