import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Die lib-Tests sind pure Unit-Tests ohne DOM und ohne DB — Node-Environment
// reicht. Der '@'-Alias spiegelt tsconfig.json paths, damit Tests dieselben
// Import-Pfade nutzen wie der Produktionscode.
//
// Der Anreicherungs-Schreibpfad braucht KEIN vi.mock('@/lib/supabase/admin'):
// er bekommt den Client hereingegeben, statt ihn selbst zu beschaffen. Das
// umgeht zugleich die 'server-only'-Falle, die jeden Import in Node wirft.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
})
