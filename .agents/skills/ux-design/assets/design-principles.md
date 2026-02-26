# Design Principles

## Core Usability Principles

### Make It Easy

Streamline how it is used, reducing steps and effort to reach the goal as much as possible.

### Mapping

Make the relationship between the controls and their effects easy to understand. Use cues like spatial arrangement, shape, color, and symbols.

### Be Modeless

Eliminate modes as much as possible. In UI, a mode is when the meaning of an action changes depending on context, limiting what users can do or forcing a fixed sequence. A modeless UI lets users work in any order.

### Use the User's Language

Use words users normally use, not internal technical terms or industry jargon.

### Hick's Law

Choosing one option takes time proportional to the number of options. Even if you know what you want, more options still take more time.

### Conservation of Complexity

There is a limit to how much you can simplify a process. You can't eliminate complexity; you can only move it. By moving complexity from the user to the system as much as possible, you can improve usability.

### Task Coherence

Users are likely to do today what they did yesterday. This is called task coherence. Remembering only what users last did can have the same effect as accurately predicting their behavior.

### Possibility vs Probability

Don't make normal use cumbersome by over-considering rare events. Designers should emphasize the main case. Treating main-case and edge-case features side by side makes interfaces complex and harms normal use.

### Have the Guts to Simplify

If you try to satisfy every design requirement, you may never ship anything coherent. Design requires the guts to make trade-offs. Prioritizing completeness and strictness too much can add options and obscure the core intent.

### Prospective Memory

Let users leave cues for their future self. Allow bookmarking or flagging content, keeping windows open, using virtual sticky notes or markers, and saving drafts so they can return later.

## Visual Design & Communication

### Consistent Graphic Tone

Keep tone and manner consistent across graphic elements: hue/saturation/brightness, gradients, borders, shadows, corner radius, fills and strokes, line thickness, representational vs abstract, and so on.

### Communicate Meaning, Not Data

Users want meaning, not raw numbers. For example, they'd rather know what percentage of disk space remains than how many bytes are used. When buying a music player, they'd rather know how many songs it holds than the exact capacity.

### Icons Represent Nouns or Adjectives

Base icons on the object they symbolize (a noun) or the resulting state (an adjective). Since processes (verbs) are hard to depict, avoid making them icons except for a few common ones.

### Minimal Highlight Changes

To highlight one item among peers, change only one visual component (or add only one). If the change is too large, it stops reading as a highlight and looks like a different kind of element.

### Consider Optical Illusions

Unifying sizes, shapes, positions, and colors helps consistency, but depending on composition, optical illusions can cause unintended appearance. Know common illusion patterns and adjust visually when needed.

### Don't Overuse Color or Type

Colors and typefaces can emphasize elements and indicate groups, but using too many makes screens messy; use them sparingly.

### Lay Out Neatly

Lay out screen elements neatly along a grid. Use repetition and consistency in spacing and alignment. This creates visual stability and logically conveys structure.

## Interaction Efficiency & Object Model

### Signifiers

Make actionable elements visible and their meaning immediately clear. Use familiar expressions and obvious shapes to suggest how to use them. For example, make things that can be pressed look pressable, and things that cannot be pressed look unpressable.

### Precomputation

Preset optimal values discovered by predecessors and reuse them in design. Examples include rice cooker markings, microwave cooking timers, automatic transmission shift timing, the target position in a bidet, and various program algorithms.

### Be Object-Based

Extract objects from requirements and reflect them in the UI. If you only expose procedural steps as features, the system becomes inefficient and hard to understand. Identify the underlying objects so users can act on them directly to achieve goals.

### Bind Data

When the same object is visible in multiple views at once, keep those views in sync. Two-way real-time updates let users feel they are acting directly on the object without worrying about internal processing.

### Zero, One, Infinity

Don't set arbitrary limits on counts. The number of elements should be 0, 1, or infinity. Don't limit things users can add, and ensure the UI doesn't break no matter how many there are.

### Every Actionable Element Matters

Every currently actionable element or selectable item must have meaning for the user's task. Meaningless elements hinder tasks just by existing, so disable or hide them.

### Immediate Gratification

Ensure users can experience success within a few seconds of starting to use the product. Show the most basic working screen or object list as early as possible so they can start immediately, and help them feel they are making legitimate progress.

### Support Spatial Memory

Let users place objects anywhere on a 2D surface and remember them spatially. Save positions and restore them on next launch. Don't change them arbitrarily for system convenience.

### Make It the User's Tool

Build the system as something that belongs to users, not providers. It should not be a tool to impose provider demands, but a tool that amplifies users' actions. Think of it not as something that makes users do things, but something users use to do things.

### Create the User Illusion

Through capacity and speed, computers can hide internal mechanisms and present objects within a virtual world so users can focus. Provide illusions such as infinitely nestable folders or instantly delivered email.

### Positive Impact

Tool design is not merely for short-term goal achievement. It serves humanity by being tolerant of human shortcomings and enhancing human strengths, enriching life. We inherit the culture accumulated within design.

## Forms, Inputs & Choices

### Simplify

Select only essential features and information, and keep elements to a minimum. A fundamental principle across all design disciplines.

### Don't Rely on Memory

Don't assume users remember message contents or property values. Information that must be referenced should be available at the moment it's needed.

### Automate Single-Option Actions

If there is only one permitted input action, making the user do it adds zero value. The system should do it automatically.

### Show Visually, Explain with Text

Make objects and their state understandable visually, and supplement with text. Use icons to convey the nature of items and labels to clarify. Use graphics to show information and numbers to provide detail.

### Surface Prerequisites Early

Ask for prerequisites early, not halfway through or at the end of a long procedure, or you may waste the user's effort. Examples include input information needed from outside the app and agreements users must accept.

### User Input Belongs to Users

Values and settings users enter should be saved by default. Items users add must be deletable by the user. Content users enter must be editable by the user.

### Don't Ask for Inconsistent Inputs

Don't ask users to perform actions that could compromise data consistency. For example, don't make them enter both date of birth and age.

### Give Forms a Narrative

Group input items into meaningful chunks. Order fields from familiar and simple first to complex later.

### Create an Interaction Flow

Use grouping and narrative ordering to guide users' eyes and actions. Action buttons suggest the end of the flow, so make the path to them easy to find.

### Good Defaults

Good defaults reduce user effort. Good defaults are lower-risk, more common, more neutral, reflect the current state, or reflect the user's past actions.

### Use Constrained Controls

When inputs must be constrained, use appropriate controls like radio buttons, dropdowns, steppers, sliders, and pickers so only valid values can be entered.

### Use Affirmative Wording

Make option text affirmative as much as possible. With on/off controls like radios and checkboxes, a negative label makes the act of selecting mean affirming a negation and is hard to understand.

### Let Users Choose Outcomes

Users often prefer selecting from options rather than typing. Instead of making them set parameter values directly, show the outcomes they can get and let them choose.

### Use Specific Verbs on Default Buttons

In modal dialogs and forms, label the default (primary) button with a concrete verb that describes the action (e.g., Save, Delete) rather than OK or Yes.

### Avoid the Flip-Flop Problem

When one button toggles on and off, it's unclear whether the label describes the current state or the state after pressing; this is the flip-flop problem. Avoid it by separating state display from the label.

### Provide Input Suggestions

Typing is costly, and users often prefer choosing. As they type, suggest what they were trying to enter or valuable values, effectively supporting the action.

### Defer Decisions

Don't demand every decision upfront. Allow users to defer non-essential answers: use some features without an account, create records without filling every attribute, etc. In forms, require only fields whose necessity is clear.

### Follow Platform Button Order

For confirm/cancel button order in dialogs, prioritize user habit and follow platform rules. If there is no clear rule, follow the common sense that left is back and right is forward, and put the confirm button on the right.

### Move as Users Intend

Interfaces should respond to user input, but to make users feel in control, don't reflect raw input-device values directly; include appropriate slack and correction.

### Increase Hot Spots

Make the tappable or clickable area for buttons larger than the visible rectangle. This balances visual design with ease of pressing. But don't separate the visible element from the hotspot.

## Error Prevention & Recovery

### Prevent Errors

Make errors less likely. Clear error messages matter, but it's more important to design so errors don't happen. Clearly distinguish confusing options, and disable actions that are meaningless in the current context.

### Structure Input Fields

Split or constrain input fields to match the required format. This hints what to enter, improves efficiency, and reduces errors. But it can be less efficient than a simple text box, so consider the nature of the information and usage context.

### Don't Demand Mechanical Precision

Reduce input-format strictness imposed for system convenience. Absorb variations like case, punctuation, and separators, and normalize or autocomplete internally. Don't demand mechanical precision from users.

### Show Previews in Choices

When changing an object's style or choosing a tool, show the resulting state as previews in the choices. Seeing results before applying properties makes trial-and-error more efficient.

### Constructive Error Messages

When errors occur, help users understand and act with clear messages. Tell them what happened and what to do next. Error codes are useless for most users. Avoid overblown wording.

## Feedback, Motion & Responsiveness

### Animate State Changes

When changing a large portion of the screen, add transition animation so users can understand continuity between states. Show intermediate steps over about 0.1-0.5 seconds.

### Bidirectional Transitions

When animating a transition from state A to B, also animate the reverse transition from B back to A. Corresponding direction helps users form a correct mental model of the information space.

### Feedback Near the Action

When indicating system state changes in response to user actions, give feedback near where the user is looking. If it's an action on a selected object, change the object itself. If it's a single button, indicate it near that button.

## Navigation & Information Architecture

### Wayfinding

Provide signposts so users don't get lost in an information space: where they are, where they can go, what's nearby, how to go back, etc. Use a consistent navigation scheme so users can grasp the overall structure.

### Escape Hatch

Provide an escape hatch so users can always return quickly to the starting place. In home-based navigation or when entering a specific mode, make it easy to get back to the base screen when users feel lost or want to stop.

### Keep Menu Items Stable

In menus listing actions or navigation items, keep item positions stable across contexts. Users remember the location spatially; if positions change, they can't learn.

### Left Back, Right Forward

If screen transitions are represented along a horizontal axis, map left to back (past) and right to forward (future). For RTL languages, reverse left and right relationships.

## Mobile & Touch Interaction

### Provide Shortcuts

For frequent actions by experienced users, provide faster methods that reduce the usual step-by-step operation: keyboard shortcuts, bookmarks, gestures, history, etc.

### Touch Targets >= 7mm

On touchscreens, make buttons and controls at least 7-10 mm square so they are easy to press. Since fingers occlude targets, add spacing to prevent mis-taps.

### Direct Manipulation Gestures

Make gesture responses follow input directly, with the target element tracking the gesture. Gestures that simply trigger commands via predetermined symbolic motions are hard to learn because the mapping is arbitrary.

### Mobile: Hierarchical Over Comprehensive

Desktop apps benefit from showing a comprehensive overview, but on mobile it's better to limit information shown at once and present it hierarchically.

## Accessibility & Internationalization

### Avoid Culture-Specific Icons

Icons are often symbolic, but avoid symbols based on signs used only in specific cultures or language-dependent idioms in international services.

### Avoid Ambiguous Symbols

In Japan, ○ and × mean good and bad, but these nuances differ by culture, so such symbols may not communicate in international interfaces. For example, × can be used with a positive nuance meaning a checkmark.

### Support Screen Readers

For use with screen readers and voice browsers, provide alternative text for non-text information such as images. Follow standard platform specifications to improve accessibility.

### Support Text Enlargement

Support larger text sizes via platform or browser text enlargement features. Implement text rendering according to standard specifications to improve accessibility.

### Don't Rely on Color

Don't make the interface depend on color. Ensure information is conveyed without color using contrast, borders and underlines, mapping by shape or position, and textual annotations. Verify by viewing the interface in grayscale.

## Learning & Adoption

### Progressive Disclosure

Hide advanced features at first so beginners can start easily, and reveal them when needed or when the user is ready. This enables staged learning.

### Help Users Learn

If users have domain experience, they should be able to use the system on their own. Don't write usage instructions into the interface; make the interface self-explanatory so how to use it is obvious.

## General UX Principles

### Make It Look Scrollable

If you want users to scroll a long vertical screen, don't align the bottom edge exactly with a content boundary, which can make it look unscrollable. Adjust content so it looks like there's more.

### Keep Simple Things Simple

As products mature and add features, common simple functions can get buried among advanced ones. Don't let tasks that were easy in a simple product require complex operations in a mature one.

### Don't Rely on Customization

Relying on customization to handle slightly different needs per user increases complexity and can reduce learnability and maintainability. Decide on the best UI spec first, and offer customization cautiously and minimally.
