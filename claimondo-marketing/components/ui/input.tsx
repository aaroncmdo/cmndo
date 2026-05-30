// AAR-908 / Komponenten-Set-Policy: dieser Input ist ein **shadcn-Legacy-Atom**
// und nur noch von schaden-melden/MiniWizardClient.tsx konsumiert. Neuer App-
// Code importiert stattdessen `@/components/primitives/Input` (Atom-Layer,
// Web+Native Dual-File, value+onChangeText-Pattern). MiniWizard-Migration =
// eigenes Folge-Ticket (braucht Form-State-Rewrite).
// Siehe `project_komponenten_set_policy`.

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-ios-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
