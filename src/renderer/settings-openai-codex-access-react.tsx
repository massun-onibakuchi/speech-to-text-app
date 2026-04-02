/*
Where: src/renderer/settings-openai-codex-access-react.tsx
What: Dedicated placeholder section for future OpenAI and Codex settings.
Why: Reserve a clear settings boundary for OpenAI/Codex without implying that
     provider wiring already exists in the current build.
*/

export const SettingsOpenAiCodexAccessReact = () => {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground"
      data-openai-codex-placeholder="true"
    >
      Dedicated OpenAI and Codex settings will live here once provider wiring is enabled.
    </div>
  )
}
