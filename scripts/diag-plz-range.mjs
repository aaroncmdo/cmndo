// Test ob range(0, 19999) wirklich alle plz_geo liefert (Service-Role)
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const t0 = Date.now()
const { data, error } = await sb.from('plz_geo').select('plz, lat, lng, ort').range(0, 19999)
const ms = Date.now() - t0
console.log('rows:', data?.length, 'in', ms, 'ms', error ? `ERR ${error.message}` : '')
const has42853 = data?.find((r) => r.plz === '42853')
console.log('PLZ 42853:', has42853)
