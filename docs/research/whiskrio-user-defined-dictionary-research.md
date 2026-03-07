<!--
Where: docs/research/whiskrio-user-defined-dictionary-research.md
What: Deep research document describing how the WhiskrIO reference codebase implements its user-defined dictionary feature.
Why: Ground future implementation work in the actual WhiskrIO behavior, data flow, and constraints before changing this project.
-->

# Research: WhiskrIO User-Defined Dictionary Feature

## 1. Scope

This document studies the user-defined dictionary feature in the reference codebase bundled at `resources/references/WhiskrIO-master.zip`.

The goal here is not to propose a new design. The goal is to document exactly how the reference implementation works today:

- where the feature lives,
- how entries are stored,
- how users create and delete entries,
- when replacements run in the transcription pipeline,
- what algorithm is used,
- and which limitations or edge cases fall out of that design.

## 2. Source Inventory

The feature is implemented across a small, tightly-coupled set of files inside the WhiskrIO archive:

1. `WhiskrIO/Sources/WhiskrIO/Models/Settings.swift`
   Stores dictionary state, persists it, exposes add/remove APIs, and applies replacements.
2. `WhiskrIO/Sources/WhiskrIO/Views/DictionaryView.swift`
   Renders the custom dictionary management window and wires add/delete UI actions to `SettingsManager`.
3. `WhiskrIO/Sources/WhiskrIO/Views/StatusBarController.swift`
   Adds the menu-bar entry that opens the dictionary window.
4. `WhiskrIO/Sources/WhiskrIO/WhiskrIO.swift`
   Applies dictionary replacements to local-transcription partial text and final local-transcription output.
5. `WhiskrIO/Sources/WhiskrIO/Services/GeminiService.swift`
   Applies dictionary replacements to Gemini-produced text before returning it.
6. `WhiskrIO/Sources/WhiskrIO/Utils/Strings.swift`
   Defines English and Japanese localization strings for the menu item and dictionary window.
7. `README.md` and `USAGE.md`
   Describe the feature at a high level for end users.

## 3. High-Level Design

WhiskrIO implements the dictionary as a simple ordered list of string replacement rules:

- each rule has `from` and `to` text,
- the list is stored in memory on a singleton settings manager,
- the whole list is serialized into `UserDefaults`,
- and replacements are applied by looping through the list and calling `replacingOccurrences(of:with:)` for each entry.

This is a post-processing system, not a speech-recognition hinting system.

That distinction matters:

- the speech model is not given dictionary entries as vocabulary hints,
- the dictionary does not influence decoding,
- and the feature only edits text after the transcription engine has already produced text.

In other words, the feature is closer to global find-and-replace than to a pronunciation lexicon or STT biasing dictionary.

## 4. Data Model

The dictionary entry type is defined at the bottom of `Settings.swift`:

```swift
struct CustomDictionaryEntry: Codable, Identifiable {
    let id: UUID
    var from: String
    var to: String
}
```

Key properties of this model:

- `Codable`: entries can be encoded and decoded directly to JSON data for persistence.
- `Identifiable`: SwiftUI can render the list with stable row identity.
- `id: UUID`: each row gets a generated UUID on creation.
- `from` and `to` are plain strings with no extra metadata.

There is no additional structure for:

- case sensitivity,
- whole-word matching,
- regular expressions,
- language scoping,
- enable/disable flags,
- priority fields,
- categories,
- or timestamps.

The UUID exists mainly for UI identity and deletion targeting, not for replacement logic.

## 5. State Ownership and Persistence

## 5.1 Owning object

Dictionary state is owned by the singleton `SettingsManager`:

```swift
class SettingsManager: ObservableObject {
    static let shared = SettingsManager()
    @Published var customDictionary: [CustomDictionaryEntry] = []
}
```

Important consequences:

- There is a single global dictionary for the entire app.
- The dictionary is observable by SwiftUI.
- Changes to the array update the UI immediately because the property is `@Published`.

## 5.2 Persistence key

The data is stored under a dedicated `UserDefaults` key:

```swift
private let dictionaryKey = "io.whiskr.dictionary"
```

This means dictionary persistence is:

- local to the current macOS user profile,
- app-global rather than per-mode/per-provider,
- and stored alongside other non-secret settings.

## 5.3 Load behavior

On app startup, `SettingsManager.shared.loadSettings()` is called from `applicationDidFinishLaunching` in `WhiskrIO.swift`.

During that load:

```swift
if let data = UserDefaults.standard.data(forKey: dictionaryKey),
   let savedDict = try? JSONDecoder().decode([CustomDictionaryEntry].self, from: data) {
    customDictionary = savedDict
}
```

Observed behavior:

- If encoded dictionary data exists and decodes cleanly, the in-memory array is replaced with the saved value.
- If no data exists, the array remains the default empty array.
- If decoding fails, the failure is silent and the array also remains empty.

There is no:

- migration logic for dictionary schema changes,
- corruption recovery flow,
- validation of entry contents during load,
- or error reporting to the user.

## 5.4 Save behavior

Saving is equally direct:

```swift
func saveDictionary() {
    if let data = try? JSONEncoder().encode(customDictionary) {
        UserDefaults.standard.set(data, forKey: dictionaryKey)
    }
}
```

Observed behavior:

- The entire dictionary array is encoded and written each time the dictionary changes.
- Save failures are ignored silently.
- There is no batching, debouncing, transactional write, or version field.

For the reference codebase’s scale, this is intentionally simple. It is also fragile in the sense that persistence errors are invisible.

## 6. Mutation APIs

`SettingsManager` exposes two mutators:

```swift
func addDictionaryEntry(from: String, to: String) {
    let entry = CustomDictionaryEntry(from: from, to: to)
    customDictionary.append(entry)
    saveDictionary()
}

func removeDictionaryEntry(at index: Int) {
    customDictionary.remove(at: index)
    saveDictionary()
}
```

Notable characteristics:

- Add is append-only.
- Deletion is index-based.
- Save happens immediately after each mutation.
- There is no update/edit method.
- There is no deduplication.
- There is no trimming, normalization, or validation inside the manager.

This means the feature trusts the UI to pass acceptable values, but the manager itself does not enforce strong rules.

## 7. Replacement Algorithm

The core dictionary logic is this method:

```swift
func applyCustomDictionary(to text: String) -> String {
    var result = text
    for entry in customDictionary {
        result = result.replacingOccurrences(of: entry.from, with: entry.to)
    }
    return result
}
```

This is the most important behavior in the entire feature.

### What it does

- Starts with the original text.
- Iterates through dictionary entries in array order.
- For each entry, replaces every occurrence of `entry.from` with `entry.to`.
- Returns the fully transformed string.

### What it does not do

- No tokenization.
- No word-boundary checks.
- No case-insensitive mode.
- No locale-aware matching options.
- No regex support.
- No longest-match sorting.
- No cycle detection.
- No protection against overlapping replacements.
- No skip for empty `from`.

### Consequence: order matters

Because the method applies replacements sequentially, the array order can change the final output.

Example:

1. `from = "AI", to = "OpenAI"`
2. `from = "OpenAI", to = "OpenAI, Inc."`

Text `"AI"` becomes:

1. after rule 1: `"OpenAI"`
2. after rule 2: `"OpenAI, Inc."`

If the order is reversed, the result is different.

### Consequence: cascading replacements are possible

A replacement can create new text that later rules also match. That means the dictionary behaves as a rewrite pipeline, not as a single-pass non-overlapping substitution table.

### Consequence: substring collisions are possible

If a user replaces a short fragment like `"a"` or `"株式会社"`, every occurrence of that substring is eligible, including occurrences inside larger words.

### Consequence: empty-string `to` is effectively deletion

The docs explicitly mention an example where users can replace a phrase with blank output to remove it. The algorithm supports that because replacing with `""` simply erases the matched substring.

### Risk: empty-string `from`

The manager does not guard against empty `from`, but the add button in the UI is disabled when `newFrom.isEmpty || newTo.isEmpty`, so the normal UI path does block that case.

Still, this protection only exists in the view layer. The core manager does not defend itself against invalid empty `from` values from other call sites.

## 8. UI Entry Point

The feature is opened from the status-bar menu in `StatusBarController.swift`:

```swift
let dictionaryItem = NSMenuItem(
    title: "カスタム辞書...",
    action: #selector(openDictionary),
    keyEquivalent: ""
)
```

And the action is:

```swift
@objc private func openDictionary() {
    DispatchQueue.main.async {
        DictionaryWindowController.shared.showWindow()
    }
}
```

Important details:

- The dictionary is a first-class menu item, separate from Settings.
- It opens its own window instead of being embedded in the main settings form.
- Access is global and always available from the menu bar.

One notable implementation detail is that `StatusBarController` hardcodes the Japanese menu title `"カスタム辞書..."` instead of using `L10n.MenuBar.customDictionary`, even though `Strings.swift` defines that localization key. So localization support exists in the string catalog but is not fully used at this menu call site.

## 9. Dictionary Window Lifecycle

The window is managed by `DictionaryWindowController` in `DictionaryView.swift`.

Key behavior:

- Singleton controller.
- Lazily creates the `NSPanel` on first open.
- Reuses the same window instance afterward.
- Updates the window title when app language changes.

Window creation:

```swift
let contentView = DictionaryView()
    .frame(minWidth: 500, minHeight: 400)

let panel = NSPanel(
    contentRect: NSRect(x: 0, y: 0, width: 600, height: 500),
    styleMask: [.titled, .closable, .miniaturizable, .resizable],
    backing: .buffered,
    defer: false
)
```

Behavioral implications:

- The dictionary UI is desktop-window oriented, not a transient popover.
- The panel is resizable and persists for the process lifetime because `isReleasedWhenClosed = false`.
- Reopening the feature brings the same window back rather than reconstructing state from scratch.

## 10. Dictionary View Behavior

The main SwiftUI view is `DictionaryView`.

It owns three local UI state variables:

- `newFrom`
- `newTo`
- `searchText`

And one shared observable object:

- `@StateObject private var settingsManager = SettingsManager.shared`

## 10.1 Search behavior

The list can be filtered:

```swift
var filteredEntries: [CustomDictionaryEntry] {
    if searchText.isEmpty {
        return settingsManager.customDictionary
    }
    return settingsManager.customDictionary.filter {
        $0.from.localizedCaseInsensitiveContains(searchText) ||
        $0.to.localizedCaseInsensitiveContains(searchText)
    }
}
```

Important observations:

- Search is case-insensitive.
- Search matches either side of the mapping (`from` or `to`).
- Search only affects the displayed list, not the stored list.
- Search does not affect replacement behavior.

## 10.2 List layout

The window contains:

1. Search bar at the top.
2. Scrollable list of entries.
3. Header row with `From -> To`.
4. Delete button per row.
5. Add-entry form at the bottom.

Each row is rendered by `DictionaryEntryRow`, which shows:

- the `from` text,
- an arrow,
- the `to` text,
- and a trash icon button.

Text display is single-line via `.lineLimit(1)`, which means long entries are visually truncated in the row.

## 10.3 Add flow

The add form requires both fields to be non-empty:

```swift
.disabled(newFrom.isEmpty || newTo.isEmpty)
```

And `addEntry()` does this:

```swift
guard !newFrom.isEmpty && !newTo.isEmpty else { return }
settingsManager.addDictionaryEntry(from: newFrom, to: newTo)
newFrom = ""
newTo = ""
```

Implications:

- Users cannot add an empty `from`.
- Users also cannot add an empty `to` through the normal UI.
- Therefore the UI contradicts the usage doc example that suggests replacing a phrase with blank output.

This is an important product inconsistency in the reference code:

- `USAGE.md` says blank replacement can be used to delete a preface.
- The concrete example row is `マエガキ -> （前置きを削除して空欄）`.
- the algorithm supports blank replacement,
- but the add form disables it because `newTo` must not be empty.

## 10.4 Delete flow

Delete is implemented by resolving the entry’s UUID back into the original array:

```swift
if let index = settingsManager.customDictionary.firstIndex(where: { $0.id == entry.id }) {
    settingsManager.removeDictionaryEntry(at: index)
}
```

Implications:

- Deletion acts on the canonical array, not the filtered display index.
- Search filtering does not break delete correctness.
- There is no confirmation dialog before removal.
- Deletion is immediate and persists instantly.

## 10.5 No edit flow

The rows are read-only. Users can add new rows and delete existing rows, but cannot modify an entry in place.

To change an existing mapping, the user must:

1. delete the old row,
2. add a new row.

## 10.6 Empty state

`Strings.swift` defines `dictionary.no_entries`, but the visible SwiftUI view shown in `DictionaryView.swift` does not actually render an explicit empty-state message in the list section. If the array is empty, the list simply renders no entry rows.

So localization exists for an empty state, but the UI does not appear to use it here.

## 11. Where Replacements Run in the Runtime Pipeline

The dictionary is applied in three runtime locations.

## 11.1 Local transcription partial text

In `WhiskrIO.swift`, while streaming local Voxtral transcription, partial transcript updates are observed:

```swift
self?.partialTranscriptObserver = voxtralService.$partialTranscript
    .receive(on: DispatchQueue.main)
    .sink { [weak self] text in
        let displayText = SettingsManager.shared.applyCustomDictionary(to: text)
        self?.overlayWindow?.updatePartialTranscript(displayText)
    }
```

Meaning:

- Dictionary replacements affect the live overlay preview.
- Users see dictionary-adjusted text before final insertion.
- This is display-time post-processing; the raw partial transcript still originates from the STT engine.

## 11.2 Local transcription final text

Also in `WhiskrIO.swift`, after the final transcript arrives from Voxtral:

```swift
var finalText = SettingsManager.shared.applyCustomDictionary(to: rawText)
finalText = SettingsManager.shared.expandSnippets(in: finalText)
```

Important ordering:

1. Apply custom dictionary.
2. Expand snippets.
3. Add to history.
4. Detect command mode / rule processing.
5. Potentially pass transformed text into later Gemini-based flows.
6. Insert text into the target app.

This means the dictionary participates early enough that downstream command-mode detection and rule matching see dictionary-adjusted text, not the raw transcript.

That is a meaningful design choice.

## 11.3 Gemini transcription result

In `GeminiService.swift`, after the service extracts and trims the text result:

```swift
var result = text.trimmingCharacters(in: .whitespacesAndNewlines)
result = SettingsManager.shared.applyCustomDictionary(to: result)
result = SettingsManager.shared.expandSnippets(in: result)
```

So the cloud-transcription path mirrors the local final-text path:

1. trim whitespace,
2. apply dictionary,
3. expand snippets,
4. add to history,
5. return transformed text.

## 12. Effective Processing Order

For finalized text, the user-defined dictionary does not stand alone. It operates as one stage inside a larger text-processing sequence.

### Local Voxtral path

1. Audio is transcribed by the local engine.
2. Partial transcript is shown with dictionary applied.
3. Final transcript arrives.
4. Dictionary replacements run.
5. Snippet expansion runs.
6. History is updated.
7. Command detection and rule processing operate on the already-rewritten text.
8. Output is inserted.

### Gemini path

1. Gemini returns text.
2. Leading/trailing whitespace is trimmed.
3. Dictionary replacements run.
4. Snippet expansion runs.
5. History is updated.
6. The transformed result is returned to the caller.

The practical consequence is that the dictionary is a foundational normalization layer in the reference app’s post-STT processing.

## 13. User-Facing Positioning in Docs

The bundled docs describe the feature simply:

- `README.md` presents it as a way to register conversions for proper nouns and specialist terms.
- `USAGE.md` explains it as a menu-driven rule list with `変換前` and `変換後`.

Example entries in the docs include:

- phonetic spoken form -> company name,
- shorthand -> phone number label,
- and removing boilerplate by converting to empty text.

The docs therefore frame the feature as:

- correction,
- normalization,
- and lightweight macro-like cleanup.

But the actual implementation is less sophisticated than that framing may imply because it is only raw substring replacement.

## 14. Limitations and Edge Cases

This section captures the most important implementation constraints visible in the source.

## 14.1 Substring replacement, not lexical replacement

The system replaces arbitrary substrings anywhere in the text. It does not know about words, punctuation boundaries, or morphemes.

Effects:

- unexpected replacements inside larger words are possible,
- short keys are especially risky,
- and users must choose `from` strings carefully.

## 14.2 Order-dependent behavior

Because replacements are sequential, the order in `customDictionary` matters.

The UI preserves insertion order because:

- new entries append to the end,
- and there is no reordering UI.

So the effective priority is creation order.

## 14.3 No edit/reorder controls

Users cannot:

- edit an existing rule,
- move a rule earlier or later,
- duplicate a rule intentionally with conflict resolution,
- or disable a rule temporarily.

That makes order-sensitive debugging harder.

## 14.4 Silent persistence failure modes

Load and save both use `try?`.

Effects:

- decoding problems drop the dictionary back to empty with no visible alert,
- encoding failures also fail silently,
- and the user receives no indication that persistence was lost.

## 14.5 UI/documentation mismatch for blank replacements

This is the clearest product-level inconsistency in the reference code.

- Docs present empty replacement as a supported use case.
- Runtime logic supports empty replacement.
- The UI blocks empty `to` values.

So, in practice, users cannot create the documented “replace with blank” rule through the standard UI.

## 14.6 No normalization on input

The add flow does not trim whitespace before saving.

So these are all distinct:

- `"AI"`
- `"AI "`
- `" AI"`

That can produce confusing behavior if a user accidentally includes spaces.

## 14.7 No deduplication or conflict detection

The feature allows:

- duplicate `from` entries,
- duplicate `to` entries,
- conflicting rules,
- and self-referential/cascading chains.

The runtime just applies all entries in order.

## 14.8 No scoping by mode or provider

The dictionary is global.

The same entry list is used for:

- local partial transcription display,
- local final transcription,
- and Gemini transcription output.

There is no per-language, per-provider, per-profile, or per-workflow variation.

## 14.9 No tests visible in the reference archive

The archived WhiskrIO codebase, as provided here, does not appear to include dedicated tests around dictionary persistence or replacement semantics.

That increases the risk that subtle ordering or UI contract changes could go unnoticed.

## 15. What the Feature Is, Precisely

The most accurate concise description of the reference implementation is:

> A global, ordered, persistent list of plain substring rewrite rules applied after transcription and before final downstream processing.

That phrasing is more precise than “custom dictionary,” because the implementation is not a true speech dictionary or lexicon.

## 16. Practical Takeaways for Future Reimplementation

If this project wants to emulate WhiskrIO faithfully, the essential behaviors to preserve are:

1. Global entry list of `from -> to` mappings.
2. Persistence in user settings storage.
3. Immediate add/delete semantics.
4. Ordered sequential replacements.
5. Application in both local and cloud final-text paths.
6. Application to local partial transcript display.
7. Dictionary-before-snippets ordering.

If this project wants to improve on WhiskrIO rather than merely copy it, the most obvious pressure points are:

1. Explicit edit support.
2. Reorder support.
3. Validation and normalization.
4. Whole-word or regex matching modes.
5. Consistent support for empty replacement if the docs promise it.
6. Tests that lock down ordering and collision semantics.

Those are not implementation recommendations for this turn. They are the main behavioral seams exposed by the reference code.

## 17. Bottom Line

WhiskrIO’s user-defined dictionary is intentionally simple:

- data model: `UUID + from + to`,
- storage: JSON in `UserDefaults`,
- UI: menu-bar panel with search, add, and delete,
- runtime: sequential substring replacement,
- placement in pipeline: after transcription, before snippet expansion and later rule/command handling.

Its simplicity makes it easy to understand and easy to reproduce. The cost of that simplicity is that the feature is order-sensitive, globally scoped, substring-based, lightly validated, and slightly inconsistent with its own user docs around blank replacements.
