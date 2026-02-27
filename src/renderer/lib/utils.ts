/*
 * Where: src/renderer/lib/utils.ts
 * What: cn() utility — merges Tailwind class strings with clsx + tailwind-merge.
 * Why: Shadcn/ui components and custom variants all depend on conflict-free class merging.
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
