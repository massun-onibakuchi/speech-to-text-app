---
title: Filler word cleanup for Dicta transcripts
description: Detail the main disfluency-removal techniques, their tradeoffs, and a concrete insertion point and rollout plan for Dicta's transcript pipeline.
date: 2026-03-30
status: active
review_by: 2026-04-06
tags:
  - research
  - transcript-cleanup
  - disfluency
  - transcription
---

# Filler word cleanup for Dicta transcripts

## Why this needs separate research

Filler-word cleanup is not the same problem as VAD.

- VAD decides whether audio sounds like speech or non-speech.
- filler cleanup decides whether recognized words should remain in the final text.

That distinction matters because Dicta's current batch pipeline already has a clear text-stage seam:

1. STT returns `result.text`
2. Dicta applies dictionary correction
3. Dicta optionally transforms the corrected transcript
4. Dicta outputs transcript or transformed text

Today, the transcript-stage text mutation is limited to dictionary replacement in [capture-pipeline.ts](/workspace/.worktrees/feat/vad/src/main/orchestrators/capture-pipeline.ts) and [dictionary-replacement.ts](/workspace/.worktrees/feat/vad/src/main/services/transcription/dictionary-replacement.ts).

If Dicta adds filler cleanup, the correct place is after transcription and after dictionary correction, not inside VAD and not inside the STT adapter.

## What counts as a filler or disfluency

There are several related categories:

- filled pauses: `um`, `uh`, `er`
- discourse markers: `like`, `you know`, `I mean`
- repetitions: `I I think`, `the the plan`
- repairs: `ship on Thurs-, on Friday`
- false starts: `what we need to, what we need is`
- stuttering-like repetitions or prolongations

These categories should not be treated identically.

For Dicta, the safest product framing is:

- remove obvious filled pauses first
- treat discourse markers conservatively
- do not silently rewrite repairs or stuttering-like events in a mode labeled `raw dictation`

## Relevant external evidence

The literature separates this problem into detection and correction.

- Classic disfluency work often uses lexical and structural signals to detect spans rather than fully rewrite sentences. Example: Snover et al. 2004 and Wu et al. 2015.
- Incremental systems combine disfluency detection with utterance segmentation for live settings, which matters for future streaming Dicta. Example: Hough and Schlangen 2017.
- Modern correction systems also use encoder-decoder models that directly convert disfluent text into fluent text. Example: Jamshid Lou et al. 2021.
- Recent work also evaluates large language models for disfluency detection and removal directly on transcripts. Example: Lima and Campelo 2024.
- Recent evidence shows ASR systems are themselves biased and less accurate on disfluent speech, especially for people who stutter, so cleanup must not be treated as harmless formatting. Example: Mujtaba et al. 2024.

Sources:

- https://aclanthology.org/N04-4040/
- https://aclanthology.org/P15-1048/
- https://aclanthology.org/E17-1031/
- https://aclanthology.org/2021.eacl-main.299/
- https://aclanthology.org/2024.stil-1.16/
- https://aclanthology.org/2024.naacl-long.269/

## Technique families

### 1. Pure rules

Input:

- transcript text only

Typical method:

- normalize casing and punctuation
- tokenize text
- drop tokens or short phrases from a hand-maintained filler list
- collapse adjacent duplicates
- rejoin text

Example targets:

- single-token fillers: `um`, `uh`, `er`, `ah`
- repeated tokens: `I I`, `the the`
- bracketed hesitations around punctuation boundaries

Strengths:

- simple
- cheap
- deterministic
- easy to test

Weaknesses:

- high false-positive risk for words like `like`, `so`, `well`, `right`
- poor handling of repairs and nested disfluencies
- language-specific and domain-specific
- no confidence score unless added manually

When it works best:

- opt-in cleanup of obvious filled pauses
- first-pass postprocessing for English-only batch transcripts

When it fails:

- conversational speech where `like` can be semantic, not filler
- transcripts containing stuttering, quoted speech, or domain jargon

Conclusion for Dicta:

- useful as a narrow baseline
- not sufficient as the full product solution

### 2. Sequence tagging

Input:

- tokenized transcript
- optionally token timing, pause duration, ASR confidence, punctuation context, or prosody

Typical method:

- assign each token a label such as `KEEP` or `DELETE`
- optionally model richer labels for repetitions, repairs, or edit terms
- remove tokens predicted as deletions

Typical model shapes:

- CRF or structured linear model
- BiLSTM-CRF
- transformer encoder tagger

Why this matters:

- the system predicts deletion at token level
- it can remain faithful by default and only remove tokens with strong confidence
- it is easier to constrain than a free-form generative rewrite

Strengths:

- more precise than pure rules
- deletions are inspectable
- easier to compute confidence thresholds
- good fit for transcript cleanup without large semantic rewrites

Weaknesses:

- requires labeled data or a solid synthetic-data strategy
- quality depends on tokenization and punctuation consistency
- can miss long-span repairs that need sentence-level rewriting

Best use for Dicta:

- a future dedicated `clean dictation` model
- especially if Dicta wants predictable deletes and auditability

### 3. Encoder-decoder correction

Input:

- disfluent transcript

Typical method:

- directly generate a fluent version of the sentence

Strengths:

- handles repairs and false starts better than simple tagging
- can improve punctuation and readability in one pass

Weaknesses:

- harder to guarantee semantic preservation
- more likely to paraphrase, not just delete fillers
- more expensive and less inspectable

Best use for Dicta:

- transformed or polished output
- not ideal for anything marketed as `raw`

### 4. LLM cleanup

Input:

- transcript
- optional constraints and glossary

Typical method:

- prompt an instruction-tuned LLM to remove disfluencies while preserving meaning

Strengths:

- best zero-shot practicality
- can be implemented quickly
- handles broader phrase-level cleanup

Weaknesses:

- nondeterministic
- may silently paraphrase or over-edit
- adds cost and latency
- hard to guarantee exact retention of names, numbers, and legal/medical wording

Best use for Dicta:

- transformed text
- optional premium `clean dictation` mode with explicit user consent about rewriting

### 5. Hybrid systems

Typical pattern:

- rules catch obvious single-token fillers
- tagger handles token-level deletes with confidence
- optional LLM pass cleans remaining sentence-level repairs for polished output only

This is the most practical product shape.

For Dicta, hybrid is stronger than choosing one method globally.

## Detailed design constraints for Dicta

### A. Preserve trust in raw dictation

If users select raw dictation, they reasonably expect transcript fidelity.

That means:

- do not silently remove all fillers from `raw dictation`
- do not silently paraphrase repairs
- do not turn spoken language into polished prose without an explicit mode or toggle

Recommended policy:

- `raw dictation`: faithful transcript, dictionary correction only
- `clean dictation`: disfluency cleanup allowed, semantic preservation required
- `transformed text`: broader rewriting allowed because transformation is already explicit

### B. Put cleanup after dictionary replacement

Current Dicta already corrects domain-specific words after STT. That should stay first.

Reason:

- dictionary normalization stabilizes tokens before cleanup
- cleanup rules and models can then operate on corrected forms
- named entities such as product names or acronyms are less likely to be deleted incorrectly

Recommended order in batch mode:

1. transcribe
2. dictionary replacement
3. filler cleanup
4. optional transformation
5. output

### C. Keep STT hints and cleanup hints separate

Current STT hints in Dicta are about improving recognition, not editing output.

That separation should remain:

- STT hints: vocabulary, context, language
- cleanup config: fidelity mode, filler list policy, aggressiveness threshold

### D. Streaming cleanup is harder than batch cleanup

In streaming mode, the model sees partial text that may still change.

That means:

- do not aggressively clean partial hypotheses
- only clean finalized segments
- if incremental cleanup is needed, use suffix-stable rules or a streaming tagger

The Hough and Schlangen 2017 paper is relevant here because it ties incremental disfluency detection to incremental utterance segmentation.

## Product-safe cleanup levels

If Dicta implements cleanup, it should expose policy levels instead of one binary flag.

Recommended levels:

### Level 0: faithful

- no filler cleanup
- dictionary correction only

### Level 1: obvious fillers

- remove only high-confidence edit terms
- examples: `um`, `uh`, isolated duplicate tokens
- do not delete `like`, `right`, `well`, `so`, `you know`

### Level 2: light cleanup

- remove obvious fillers
- collapse clear repetitions
- normalize punctuation
- keep sentence meaning and order
- still avoid broad paraphrasing

### Level 3: polished

- allow phrase-level cleanup and sentence smoothing
- only appropriate for transformed output or an explicit rewrite mode

## Recommended implementation options

### Option 1: narrow deterministic baseline

Build a small cleanup service with:

- exact filler allowlist
- duplicate-token collapse
- punctuation whitespace normalization

Guardrails:

- apply only in `clean dictation`
- keep a denylist of ambiguous tokens that must not be auto-removed
- add snapshot tests with before/after pairs

This is the fastest safe first version.

### Option 2: token-tagging cleanup service

Build or integrate a token-level disfluency detector that returns:

- token
- label: `keep | delete`
- confidence

Pipeline behavior:

- delete only above threshold
- expose thresholds as config
- log deletions during evaluation builds

This is the strongest medium-term option for a faithful cleanup mode.

### Option 3: LLM cleanup pass

Add an optional cleanup call with a hard prompt contract:

- remove disfluencies
- preserve meaning
- preserve names, numbers, units, and domain terms
- do not summarize
- do not add information

Required safeguards:

- use glossary terms from Dicta's dictionary entries
- add regression fixtures for numbers, names, acronyms, and quoted text
- keep this out of raw mode

This is the strongest fast path for polished output, but not for strict transcript fidelity.

## Recommended rollout for Dicta

### Phase 1: deterministic cleanup service

Add a new main-process service:

- `TranscriptCleanupService`

Suggested interface:

```ts
type CleanupMode = 'faithful' | 'obvious_fillers' | 'light' | 'polished'

interface CleanupInput {
  text: string
  mode: CleanupMode
  language?: string
  protectedTerms: readonly string[]
}

interface CleanupResult {
  text: string
  removedSpans: readonly {
    text: string
    startToken: number
    endToken: number
    reason: 'filled_pause' | 'duplicate' | 'discourse_marker'
  }[]
}
```

Insertion point:

- immediately after `applyDictionaryReplacement(...)` in [capture-pipeline.ts](/workspace/.worktrees/feat/vad/src/main/orchestrators/capture-pipeline.ts)

Initial behavior:

- support `faithful` and `obvious_fillers`
- only remove unambiguous single-token fillers and exact duplicate tokens

### Phase 2: add product wiring

Add a user-facing cleanup selector to output or correction settings.

Recommended default:

- raw dictation -> `faithful`
- transformed text -> unchanged for now, since transformation can already clean text

### Phase 3: evaluate model-backed cleanup

After collecting fixtures:

- compare deterministic cleanup against a tagger or LLM cleanup pass
- choose model-backed cleanup only if it materially improves precision without harming trust

## Evaluation plan

Do not ship cleanup based on intuition alone.

Build an evaluation set with:

- common fillers
- repeated words
- sentence repairs
- proper nouns
- acronyms
- numbers and units
- quoted speech
- speech from users with stuttering-like disfluencies

Track at least:

- deletion precision
- deletion recall
- exact-match retention for protected terms
- semantic similarity or human meaning-preservation rating
- user-visible bad edits per 100 transcripts
- latency and cost

For Dicta specifically, the most important metric is precision:

- a cleanup system that leaves some fillers in place is acceptable
- a cleanup system that deletes meaningful words is not

## Failure modes to design against

- deleting semantic uses of `like`, `right`, `well`, `so`
- corrupting numbers: `uh 15` -> `5`
- deleting acronyms or names that resemble fillers
- over-cleaning speech from users who stutter
- removing quoted dialogue that intentionally contains fillers
- changing tone or intent in customer messages or legal notes

## Recommendation

For Dicta, the best near-term approach is:

1. keep `raw dictation` faithful
2. add an opt-in cleanup mode after dictionary replacement
3. start with deterministic removal of only obvious fillers
4. collect fixtures and bad-edit cases
5. only then consider sequence tagging or LLM cleanup for stronger modes

That is slower than dropping an LLM prompt into the pipeline, but it is much safer and better aligned with user trust.
