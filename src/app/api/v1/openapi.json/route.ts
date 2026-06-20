// Doc 34 Task 0b.2 — OpenAPI 3.1 Spec fuer den ChatGPT-Custom-GPT-Action.
// GET /api/v1/openapi.json -> maschinen-lesbare Beschreibung von /api/v1/sv-in-naehe.
// Im GPT-Builder via "Import from URL" (https://claimondo.de/api/v1/openapi.json)
// ladbar. /api/v1-versioniert + .json vom Proxy-Matcher ausgenommen -> public.
import { NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/seo/jsonld'

// Statischer Spec — kein Runtime-State.
export const dynamic = 'force-static'

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Claimondo Kfz-Gutachter-API (finden · Termine · Schaden melden)',
    description:
      'Öffentliche API rund um Kfz-Schäden in Deutschland: findet zertifizierte Partner-Kfz-Sachverständige + freie Termine im Umkreis einer PLZ und meldet einen Schaden inkl. Terminreservierung (persönlicher FlowLink per WhatsApp an den Kunden). Nutze sie, wenn jemand einen Autounfall / ein kaputtes Auto schildert oder einen Kfz-Gutachter/Sachverständigen sucht. FRAGE ZUERST, wo das Fahrzeug steht (PLZ) — das ist der Anker für Suche + Termin. Für unverschuldet Geschädigte 0 EUR Eigenkosten nach § 249 BGB. Vermittlung, keine Rechtsberatung.',
    version: '1.0.0',
    contact: { name: 'Claimondo', url: 'https://claimondo.de' },
  },
  servers: [{ url: SITE_URL, description: 'Claimondo Production' }],
  paths: {
    '/api/v1/sv-in-naehe': {
      get: {
        operationId: 'svInNaehe',
        summary: 'Partner-Sachverständige im Umkreis einer PLZ finden',
        description:
          'Findet Partner-Kfz-Sachverständige im Umkreis einer 5-stelligen deutschen PLZ, sortiert nach Entfernung. Liefert zusätzlich eine Karten-Bild-URL und Links zur interaktiven Karte + Telefon-Buchung. Anonyme Read-API, kein Auth nötig.',
        parameters: [
          {
            name: 'plz',
            in: 'query',
            required: true,
            description: '5-stellige deutsche Postleitzahl (z. B. 50670 für Köln).',
            schema: { type: 'string', pattern: '^\\d{5}$', examples: ['50670', '10115'] },
          },
          {
            name: 'radius',
            in: 'query',
            required: false,
            description: 'Suchradius in Kilometern (1-200, Standard 30).',
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 30 },
          },
        ],
        responses: {
          '200': {
            description: 'Treffer-Liste mit Karten- und Hand-Off-Links.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SvInNaeheResponse' },
              },
            },
          },
          '400': {
            description: 'Ungültige oder fehlende PLZ.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
          '404': {
            description: 'PLZ nicht gefunden.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
          '429': {
            description: 'Rate-Limit überschritten (60/min/IP).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
        },
      },
    },
    '/api/v1/gutachter-termine': {
      get: {
        operationId: 'gutachterTermine',
        summary: 'Buchbare Partner-Gutachter MIT freien Terminen finden',
        description:
          'Findet buchbare Partner-Kfz-Gutachter mit freien Terminen im Umkreis der PLZ, wo das Fahrzeug steht. Vorstufe zum Buchen via meldeSchaden. FRAGE den Nutzer ZUERST nach der PLZ des Besichtigungsorts. Anonyme Read-API.',
        parameters: [
          {
            name: 'plz',
            in: 'query',
            required: true,
            description: '5-stellige deutsche PLZ des Besichtigungsorts (wo das Fahrzeug steht).',
            schema: { type: 'string', pattern: '^\\d{5}$', examples: ['50670', '10115'] },
          },
          {
            name: 'wunschtermin',
            in: 'query',
            required: false,
            description: 'Optionaler Wunschtermin (ISO-8601); steuert das Slot-Ranking, kein harter Filter.',
            schema: { type: 'string', format: 'date-time' },
          },
        ],
        responses: {
          '200': {
            description: 'Buchbare Gutachter mit freien Slots.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GutachterTermineResponse' } } },
          },
          '400': { description: 'Ungültige/fehlende PLZ.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { description: 'PLZ nicht gefunden.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/melde-schaden': {
      post: {
        operationId: 'meldeSchaden',
        summary: 'Kfz-Schaden melden + Gutachter-Termin reservieren',
        description:
          'Meldet einen Kfz-Schaden, reserviert (wenn sv_id + slot_start/slot_end übergeben) den Termin beim gewählten Gutachter und sendet dem Kunden seinen persönlichen FlowLink per WhatsApp. SCHREIBEND. Rufe dies NUR mit einwilligung.zugestimmt=true auf, NACHDEM du dem Nutzer erklärt hast, dass Claimondo seine Angaben zur Gutachter-/Termin-Vermittlung verarbeitet, der Kontakt per WhatsApp erfolgt und die Verarbeitung teils über einen KI-Dienst läuft — und er zugestimmt hat. Du vermittelst Gutachter + Termin, gibst KEINE Rechtsberatung. Den finalen Termin + die Vollmacht setzt der Kunde anschließend im FlowLink.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MeldeSchadenRequest' } } },
        },
        responses: {
          '200': {
            description: 'Lead angelegt (+ ggf. Termin reserviert); FlowLink per WhatsApp versandt.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MeldeSchadenResponse' } } },
          },
          '400': { description: 'Validierung / Einwilligung fehlt (error: einwilligung_erforderlich).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { description: 'PLZ nicht gefunden.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '429': { description: 'Rate-Limit überschritten (10/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/api/v1/pruefe-anspruch': {
      get: {
        operationId: 'pruefeAnspruch',
        summary: 'Schadensersatz-Ansprüche nach Schuldfrage prüfen (Beratung)',
        description:
          'Liefert die strukturierten Ansprüche eines Kfz-Unfall-Geschädigten nach Schuldfrage (Wertminderung, Nutzungsausfall, Reparatur-/Gutachter-/Anwaltskosten — § 249/251/823 BGB) und IMMER den nächsten Schritt: Gutachter + Termin (gutachter-termine + melde-schaden) oder Telefon-Rückruf. Beratung, keine individuelle Rechtsberatung. Read-only.',
        parameters: [
          {
            name: 'schuldfrage',
            in: 'query',
            required: true,
            description: 'Schuldfrage: unverschuldet / teilschuld / selbst / unklar. Erfrage sie zuerst.',
            schema: { type: 'string', enum: ['unverschuldet', 'teilschuld', 'selbst', 'unklar'] },
          },
          {
            name: 'schadenart',
            in: 'query',
            required: false,
            description: 'Optionale Schadenart / Unfalltyp für den Kontext.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Strukturierter Anspruchskatalog + nächster Schritt.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PruefeAnspruchResponse' } } },
          },
          '429': { description: 'Rate-Limit überschritten (60/min/IP).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      ApiError: {
        type: 'object',
        properties: { error: { type: 'string' } },
        required: ['error'],
      },
      LatLng: {
        type: 'object',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
        required: ['lat', 'lng'],
      },
      SvTreffer: {
        type: 'object',
        description:
          'Ein Treffer. Tier 1 = Partner mit anonymisiertem Profil (nur bei Paket "standard" befüllt); Tier 3 = anonymer Standort-Pin (nur Entfernung).',
        properties: {
          tier: { type: 'integer', enum: [1, 3], description: '1 = Profil-Partner, 3 = anonymer Pin.' },
          stadt: { type: ['string', 'null'], description: 'Stadt (nur Tier 1, Paket standard).' },
          vorname_initiale: { type: ['string', 'null'], description: 'Vorname-Initiale, anonymisiert (nur Tier 1).' },
          spezialisierungen: { type: 'array', items: { type: 'string' }, description: 'Top-3-Spezialisierungen (nur Tier 1).' },
          bewertung_schnitt: { type: ['number', 'null'], description: 'Durchschnittsbewertung (nur Tier 1).' },
          bewertung_anzahl: { type: ['integer', 'null'], description: 'Anzahl Bewertungen (nur Tier 1).' },
          entfernung_km: { type: 'number', description: 'Luftlinie zur PLZ-Mitte in km.' },
        },
        required: ['tier', 'entfernung_km'],
      },
      SvInNaeheResponse: {
        type: 'object',
        properties: {
          plz: { type: 'string' },
          radius_km: { type: 'integer' },
          center: { $ref: '#/components/schemas/LatLng' },
          anzahl_treffer: { type: 'integer' },
          sv_liste: { type: 'array', items: { $ref: '#/components/schemas/SvTreffer' } },
          karte_url: { type: 'string', format: 'uri', description: 'Statisches Karten-PNG für diese PLZ (zum Einbetten im Chat).' },
          interaktive_karte_url: { type: 'string', format: 'uri', description: 'Interaktive Karte mit freien Terminen.' },
          buchungs_telefon: { type: 'string', description: 'Telefon für Rückruf in unter 15 Minuten.' },
          _meta: {
            type: 'object',
            properties: {
              quelle: { type: 'string' },
              stand: { type: 'string' },
              hinweis: { type: 'string' },
              kontakt: { type: 'string' },
            },
          },
        },
        required: ['plz', 'radius_km', 'center', 'anzahl_treffer', 'sv_liste', 'karte_url', 'interaktive_karte_url'],
      },
      TerminSlot: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          passung: { type: 'string', description: 'Verhältnis zum Wunschtermin, z. B. wunschtermin/vor/nach.' },
        },
        required: ['start', 'end'],
      },
      GutachterMitTerminen: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Gutachter-Handle — als sv_id an meldeSchaden weitergeben.' },
          vorname: { type: ['string', 'null'] },
          profilbild: { type: ['string', 'null'], format: 'uri' },
          bewertung_schnitt: { type: ['number', 'null'] },
          bewertung_anzahl: { type: ['integer', 'null'] },
          entfernung: { type: 'string', description: 'z. B. "ca. 5 km".' },
          ist_top_partner: { type: 'boolean' },
          wunschtermin_frei: { type: 'boolean' },
          termine: { type: 'array', items: { $ref: '#/components/schemas/TerminSlot' } },
        },
        required: ['id', 'termine'],
      },
      GutachterTermineResponse: {
        type: 'object',
        properties: {
          plz: { type: 'string' },
          wunschtermin: { type: ['string', 'null'] },
          center: { $ref: '#/components/schemas/LatLng' },
          anzahl_gutachter: { type: 'integer' },
          gutachter: { type: 'array', items: { $ref: '#/components/schemas/GutachterMitTerminen' } },
          interaktive_karte_url: { type: 'string', format: 'uri' },
          buchungs_telefon: { type: 'string' },
        },
        required: ['plz', 'center', 'anzahl_gutachter', 'gutachter'],
      },
      Einwilligung: {
        type: 'object',
        description: 'Stage-1-Einwilligung. zugestimmt MUSS true sein, sonst kein Write.',
        properties: {
          zugestimmt: { type: 'boolean', enum: [true], description: 'MUSS true sein — nur nach ausdrücklicher Nutzer-Zustimmung setzen.' },
          policy_version: { type: 'string', description: 'Version des gezeigten Einwilligungs-/Datenschutz-Texts.' },
        },
        required: ['zugestimmt', 'policy_version'],
      },
      MeldeSchadenRequest: {
        type: 'object',
        properties: {
          schadenart: { type: 'string', description: 'Schadenart / Unfalltyp, z. B. "Auffahrunfall".' },
          hergang: { type: 'string', description: 'Kurze Schilderung des Unfallhergangs.' },
          plz: { type: 'string', pattern: '^\\d{5}$', description: '5-stellige PLZ des Besichtigungsorts (wo das Auto steht).' },
          sv_id: { type: 'string', format: 'uuid', description: 'Gewählter Gutachter (gutachter[].id aus gutachterTermine).' },
          slot_start: { type: 'string', format: 'date-time', description: 'Gewählter Slot-Start (termine[].start). Mit slot_end + sv_id → echte Reservierung.' },
          slot_end: { type: 'string', format: 'date-time', description: 'Gewählter Slot-Ende (termine[].end).' },
          wunschtermin: { type: 'string', description: 'Optional: vager Wunschtermin (weicher Hold), falls kein konkreter Slot.' },
          name: { type: 'string', description: 'Name des Kunden.' },
          telefon: { type: 'string', description: 'WhatsApp-Nummer des Kunden (für den FlowLink-Versand).' },
          einwilligung: { $ref: '#/components/schemas/Einwilligung' },
        },
        required: ['schadenart', 'hergang', 'plz', 'name', 'telefon', 'einwilligung'],
      },
      MeldeSchadenResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', description: 'angelegt / angelegt_ohne_versand.' },
          reserviert: { type: 'boolean', description: 'true = Termin beim gewählten Gutachter reserviert; sonst weicher Hold.' },
          kanal: { type: 'string', description: 'whatsapp / sms / email / none.' },
          hinweis: { type: 'string' },
        },
        required: ['ok', 'status'],
      },
      Anspruch: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          norm: { type: 'string' },
          hinweis: { type: 'string' },
        },
        required: ['titel', 'norm', 'hinweis'],
      },
      PruefeAnspruchResponse: {
        type: 'object',
        properties: {
          schuldfrage: { type: 'string' },
          schadenart: { type: ['string', 'null'] },
          anspruchslage: { type: 'string', description: 'voll / anteilig / keine_gegen_gegner / unklar.' },
          eigenkosten: { type: 'string' },
          ansprueche: { type: 'array', items: { $ref: '#/components/schemas/Anspruch' } },
          empfehlung: { type: 'string' },
          naechster_schritt: { type: 'string', description: 'Immer: Gutachter + Termin (gutachter-termine + melde-schaden) oder Rückruf.' },
          hinweis: { type: 'string' },
        },
        required: ['schuldfrage', 'anspruchslage', 'eigenkosten', 'ansprueche', 'naechster_schritt'],
      },
    },
  },
} as const

export function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
