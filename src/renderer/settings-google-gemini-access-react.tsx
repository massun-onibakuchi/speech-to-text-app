/*
Where: src/renderer/settings-google-gemini-access-react.tsx
What: STT-style cloud access form wrapper for the current Google Gemini setup.
Why: Keep Google/Gemini access visually aligned with the provider -> model -> key
     shape used in the STT section without changing preset ownership.
*/

import type { ComponentProps } from 'react'
import { SettingsApiKeysReact } from './settings-api-keys-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'

const GOOGLE_PROVIDER_ID = 'google'
const GOOGLE_MODEL_ID = 'gemini-2.5-flash'

type SettingsGoogleGeminiAccessReactProps = ComponentProps<typeof SettingsApiKeysReact>

export const SettingsGoogleGeminiAccessReact = (props: SettingsGoogleGeminiAccessReactProps) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">LLM provider</span>
        <Select value={GOOGLE_PROVIDER_ID} onValueChange={() => {}}>
          <SelectTrigger id="settings-google-provider" data-testid="select-google-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GOOGLE_PROVIDER_ID}>Google</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 text-xs">
        <span className="text-muted-foreground">LLM model</span>
        <Select value={GOOGLE_MODEL_ID} onValueChange={() => {}}>
          <SelectTrigger
            id="settings-google-model"
            data-testid="select-google-model"
            className="font-mono"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GOOGLE_MODEL_ID} className="font-mono">{GOOGLE_MODEL_ID}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SettingsApiKeysReact {...props} />
    </div>
  )
}
