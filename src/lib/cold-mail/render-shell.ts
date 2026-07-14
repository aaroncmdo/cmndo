import { render } from '@react-email/render'
import { ColdMailShell } from '@/lib/email/google/templates/ColdMailShell'

export async function renderColdMailHtml(opts: { bodyHtml: string; abmeldeUrl: string }): Promise<string> {
  return render(ColdMailShell({ bodyHtml: opts.bodyHtml, abmeldeUrl: opts.abmeldeUrl }))
}
