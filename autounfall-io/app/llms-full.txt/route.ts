import { buildLlmsFullTxt } from '@/lib/llms'

// /llms-full.txt — vollständige KI-Sitemap inkl. Quick-Answers/Kerninhalte,
// datengetrieben aus den Content-Quellen (lib/llms.ts). Statisch zur Build-Zeit.
export const dynamic = 'force-static'

export function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
