---
name: ux-design
description: Create polished design using applied UX psychology. Use this skill when building web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI).
---

Design UX changes that are grounded in psychology and still respectful, ethical, and testable.

# Workflow

1. Ask for the missing inputs (keep it short):
   - Who is the user? What is the primary task?
   - What is the current funnel step that’s underperforming?
   - Any constraints (compliance, accessibility, branding, tech)?

2. Choose the smallest set of principles that fit the problem:
   - Too many options / complex forms → decision fatigue, cognitive load, defaults, framing
   - Users miss key actions → visual hierarchy, visual anchors, banner blindness
   - Users don’t finish onboarding/tasks → Zeigarnik effect, goal-gradient, progressive disclosure
   - Users don’t trust the product → aesthetic-usability, social proof, endowment/ownership
   - Users complain about “slowness” → Doherty threshold, skeleton screens, labor illusion

3. Propose only changes that can be implemented and verified:
   - Prefer 3–7 high-impact changes over a long list.
   - Keep each change specific enough to build without re-interpretation.

# Design Thinking

## 1) Simplify decision-making

Users have limited mental energy; repeated choices lead to **decision fatigue**, and judgment quality declines.

- Minimize choices: show only the necessary options.
- Use **default bias**: pre-select sensible defaults to reduce effort.
- Pricing / choice architecture:
  - **Anchor effect**: show a higher reference point first so later prices feel more reasonable.
  - **Decoy effect** (asymmetric dominance): add a third “decoy” option to make a target choice feel like better value.
- Use **framing**: present the same facts in a way that highlights benefits or minimizes perceived losses.

## 2) Guide attention and manage information flow

Human cognitive capacity is limited; organization prevents **cognitive load**.

- Establish **visual hierarchy** with size, color, contrast, and position.
- Create **visual anchors** that pull attention to the most important element first.
- Apply **progressive disclosure**: hide advanced/secondary controls until needed.
- Optimize for memory (**serial position effect**): put critical items early and late in lists.
- Avoid **banner blindness**: don’t put essential actions/info where users expect ads.

## 3) Foster engagement and motivation

Use nudges that help users complete tasks and build habits.

- **Zeigarnik effect**: unfinished tasks linger; use checklists and “already completed” first steps to encourage completion.
- **Goal-gradient effect**: effort increases near a goal; show progress bars or step counts.
- **Variable rewards**: unpredictable rewards can sustain repeated engagement.
- **Curiosity gap**: partially hide information to encourage action to “fill the gap”.

## 4) Build trust and emotional connection

The emotional feel of a product affects perceived value.

- **Aesthetic-usability effect**: users perceive beautiful UIs as more usable and tolerate minor issues.
- **Peak-end rule**: users remember the peak moment and the ending; design a strong finish.
- **Social proof**: show credible logos, reviews, usage stats, or testimonials.
- **Endowment effect** (ownership): let users customize early to feel “this is mine”.

## 5) Optimize system performance and interaction

Performance is psychological, not just technical.

- **Doherty threshold**: target response times under ~0.4s; if slower, use skeleton screens and immediate feedback.
- **Labor illusion**: showing “work” can increase perceived value and trust in results.
- **Intentional friction**: add confirmations for irreversible/high-risk actions to prevent mistakes.

## 6) Mitigate designer/developer/research biases

Design decisions are vulnerable to cognitive bias.

- Bridge the **empathy gap**: don’t assume users think like builders; use data and research.
- Watch for **confirmation bias**: seek disconfirming evidence and diverse sources.
- Reduce **survey bias**: avoid leading questions and skewed samples.

## Analogy (visual hierarchy + progressive disclosure)

Think of a UI like a multicourse meal:

- **Visual hierarchy** is the menu emphasizing chef’s specials to guide attention.
- **Progressive disclosure** is service timing: bring what’s needed for the current course, not everything at once.
