/*
 * Where: src/renderer/kbd.tsx
 * What: Compact keyboard key token component for shortcut contract rendering.
 * Why: STY-06b requires shortcut rows to render segmented combos with reusable <Kbd> visuals.
 */

import type { PropsWithChildren } from 'react'
import { cn } from './lib/utils'

interface KbdProps {
  className?: string
}

export const Kbd = ({ className, children }: PropsWithChildren<KbdProps>) => (
  <kbd
    className={cn(
      'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1.5',
      'text-[10px] font-mono text-foreground',
      className
    )}
  >
    {children}
  </kbd>
)
