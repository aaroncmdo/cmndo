import { z } from 'zod'

// AAR-902 Prototyp: Mini-Wizard Zod-Schema. Vier Felder + DSGVO-Consent.
// Schritt-1 des kommenden Lean-Flows. Volle Spec:
// docs/14.05.2026/mini-wizard-magic-link-konzept.md

export const miniWizardSchema = z.object({
  schuldfrage: z.enum(['gegner', 'unklar', 'eigenverantwortung']),
  // F4-a (Entry-Point-Audit 24.07.): Kasko-Folgefrage bei Eigenverschulden. Nur Pflicht wenn
  // schuldfrage='eigenverantwortung' (refine unten). Kasko (ja) -> Lead geht durch in den /flow
  // (kasko-Szenario); reiner Selbstzahler (nein) -> /selbstverschulden + Werkstatt-Finder-CTA.
  eigeneVersicherung: z.enum(['ja', 'nein']).optional(),
  unfalldatum: z
    .string()
    .min(1, 'Unfalldatum ist erforderlich')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Ungültiges Datum'),
  unfallort: z.string().trim().min(3, 'Unfallort ist zu kurz').max(200),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  telefon: z
    .string()
    .trim()
    .regex(/^\+?[0-9 /()\-]{6,20}$/, 'Ungültiges Telefon-Format'),
  vorname: z.string().trim().min(1, 'Vorname ist erforderlich').max(50),
  nachname: z.string().trim().min(1, 'Nachname ist erforderlich').max(50),
  dsgvo_consent: z.literal(true, {
    error: 'DSGVO-Einwilligung ist erforderlich',
  }),
  // 15.05.2026: Promo-Code direkt im FormData transportiert (Cookie-Mechanismus
  // entfernt — cookies().set() im Server-Component-Render-Pfad crasht in
  // Next 16+, weder PR #1308 noch #1319 konnten alle drei Crash-Quellen
  // dauerhaft schließen). Validator deckungsgleich mit isValidPromoCodeFormat:
  // MK- + 4 alphanumerische Zeichen. Optional — Wizard funktioniert auch ohne
  // Promo (Direct-Lead ohne Makler-Attribution).
  promoCode: z
    .union([z.literal(''), z.string().regex(/^MK-[A-Z0-9]{4}$/, 'Ungültiges Promo-Code-Format')])
    .optional(),
  // QR-/Offline-Kampagnen-Tag (?src=<slug>). Optional und bewusst LOSE validiert
  // (nur Laengen-Cap): ein krummer Tag darf NIE die Schadenmeldung blocken. Die
  // kanonische Sanitisierung + Namespacing passiert in campaignSourceChannel().
  src: z.string().max(80).optional(),
}).refine(
  // F4-a: Bei Eigenverschulden MUSS die Kasko-Frage beantwortet sein — sonst wuesste der /flow nicht,
  // ob kasko (ja) oder selbstzahler (nein). Fuer gegner/unklar irrelevant.
  (d) => d.schuldfrage !== 'eigenverantwortung' || d.eigeneVersicherung != null,
  { message: 'Bitte gib an, ob du kaskoversichert bist.', path: ['eigeneVersicherung'] },
)

export type MiniWizardInput = z.infer<typeof miniWizardSchema>
