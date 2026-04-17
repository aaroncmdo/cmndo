// AAR-381: Alter /gutachter/route Pfad → Heute-Tab (Planungs-Ansicht).
// Die Live-Route wird ab AAR-382 im Fokus-Modus (/gutachter/feldmodus) gerendert.
import { redirect } from 'next/navigation'

export default function TagesroutePage() {
  redirect('/gutachter/heute')
}
