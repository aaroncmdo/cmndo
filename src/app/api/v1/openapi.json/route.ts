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
    title: 'Claimondo Sachverständigen-Finder API',
    description:
      'Öffentliche, anonyme Read-API: findet zertifizierte Partner-Kfz-Sachverständige im Umkreis einer deutschen Postleitzahl. Liefert zusätzlich eine Karten-Bild-URL und Hand-Off-Links. Für unverschuldet Geschädigte 0 EUR Eigenkosten nach § 249 BGB.',
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
