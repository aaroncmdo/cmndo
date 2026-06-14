import { buildLlmsTxt } from '@/lib/llms'

// /llms.txt — KI-Sitemap, datengetrieben aus den Content-Quellen (lib/llms.ts).
// Statisch zur Build-Zeit erzeugt; neue Seiten erscheinen automatisch.
export const dynamic = 'force-static'

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
