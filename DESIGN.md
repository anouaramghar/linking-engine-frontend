---
name: LinkMesh Dashboard
description: Desktop operator workspace for reviewing, approving, and publishing internal-link suggestions.
colors:
  primary: "#292524"
  primary-active: "#0c0a09"
  ink: "#0c0a09"
  body: "#4e4e4e"
  muted: "#706a62"
  muted-soft: "#a8a29e"
  canvas: "#f5f5f5"
  canvas-soft: "#fafafa"
  surface-card: "#ffffff"
  surface-strong: "#f0efed"
  hairline: "#e7e5e4"
  hairline-strong: "#d6d3d1"
  hairline-control: "#928c84"
  selection: "#c8b8e0"
  success: "#16a34a"
  error: "#dc2626"
  tint-positive: "#dbf4e4"
  tint-negative: "#fde2e2"
  tint-active: "#e6dff3"
  tint-progress: "#dbe8f6"
  login-neon: "#cc9149"
  orb-mint: "#a7e5d3"
  orb-peach: "#f4c5a8"
  orb-lavender: "#c8b8e0"
  orb-sky: "#a8c8e8"
  orb-rose: "#e8b8c4"
typography:
  display:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "24px"
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.96px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
  full: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  base: "16px"
  md: "20px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  section: "96px"
  score: "72px"
  score-wide: "104px"
  meter: "3px"
  filter: "16rem"
  decision: "220px"
  decision-review: "290px"
  chart: "620px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  badge:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: LinkMesh Dashboard

## Overview

**Creative North Star: "The Quiet Review Desk"**

LinkMesh is a desktop operator workspace that should feel calm while a person makes high-consequence editorial decisions. It inherits the incumbent ElevenLabs-inspired world: an off-white canvas, warm near-black ink, quiet hairlines, and an editorial serif for headings. Brand voltage comes from atmospheric pastel orbs, never from loud dashboard chrome.

The interface is dense by intention. A reviewer scans many suggestions, filters them, selects exact edits, and moves the approved work into the publication inbox. The visual system therefore favors stable rows, modest controls, explicit status language, and a single restrained action treatment over decorative variety. The product is desktop-only by decision; desktop widths are the supported composition.

**Key Characteristics:**

- Off-white canvas and warm ink establish a low-noise reading floor.
- Inter carries the operator UI; EB Garamond supplies the light editorial display voice.
- Ink pills are reserved for primary actions; status color never stands alone.
- Cards use a hairline and one soft shadow tier, not stacked effects.
- The queue is the primary work surface: selection, pending feedback, and exact-edit hand-off stay visible.
- Atmospheric orbs are decoration only; they never become button fills or text colors.

## Colors

The palette is warm, restrained, and role-named. Light and dark themes re-point the same semantic roles rather than making components choose colors themselves.

### Primary

- **Ink action** (`{colors.primary}`): the scarce primary button fill and the strongest action signal.
- **Ink action active** (`{colors.primary-active}`): the pressed state of the primary action.

### Neutral

- **Canvas** (`{colors.canvas}`) and **soft canvas** (`{colors.canvas-soft}`): page floors and quiet bands.
- **Card surface** (`{colors.surface-card}`) and **strong surface** (`{colors.surface-strong}`): raised content and compact badges.
- **Ink** (`{colors.ink}`), **body**, and **muted**: a readable hierarchy for headings, running copy, and metadata.
- **Hairline** (`{colors.hairline}`), **strong hairline**, and **control hairline**: dividers, card edges, and form boundaries.

### Semantic

- **Success** (`{colors.success}`): completed or healthy states, always paired with text.
- **Error** (`{colors.error}`): failure fills and borders; error copy uses the dedicated readable ink role.
- **Selection lavender** (`{colors.selection}`): keyboard focus/selection ground, carrying ink text rather than meaning by color alone.

### Status Tints

- **Positive** (`{colors.tint-positive}`), **negative** (`{colors.tint-negative}`), **active** (`{colors.tint-active}`), and **progress** (`{colors.tint-progress}`): the grounds a status badge takes when it reports a state. Named for the state, not the hue, so a meaning can be re-pointed without every badge learning a new color name.
- They are opaque values rather than the orbs at an opacity, because a badge lands on the card, the strong surface, and the soft canvas in different views, and an alpha tint would measure a different contrast on each.
- **Pending and expired take no tint.** A review queue is mostly pending; tinting the default state would spend the signal on the majority.

**The Second-Channel Rule.** A tint is always added on top of the status dot and the status word, never in place of either. Nothing in this app depends on a tint being seen.

### Atmospheric

- **Mint, peach, lavender, sky, and rose orbs** (`{colors.orb-mint}` through `{colors.orb-rose}`): soft radial decoration behind a surface or metric. They are not UI state colors.
- The five stops also serve as **site identity**. Each connected site is assigned one stop from its id, and wears it as a circular plate on the Sites page and in the queue, plus a 10% wash across its group header. Keyed to the id and not the list position, so deleting a site does not re-color the fleet.
- Site hue is recognition, not information: the site is always named in text beside its plate.

### Authentication Accent

- **Login amber** (`{colors.login-neon}`): the reserved Telegram sign-in ring. It is decorative authentication chrome only and does not enter dashboard actions or status styling.

**The Role-Name Rule.** Components consume semantic roles such as `canvas`, `ink`, and `hairline`; they do not choose raw palette values at the call site.

## Typography

**Display Font:** EB Garamond (with Georgia, serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)
**Label/Mono Font:** Inter for labels; monospace is reserved for code and measured data.

**Character:** EB Garamond at a light display weight keeps the editorial voice human and unforced. Inter is compact, legible, and slightly tracked so a long review queue remains scannable.

### Hierarchy

- **Display** (light, 24px, 1.2): card and page section headings.
- **Title** (medium, 20px, 1.35): component titles and meaningful decision surfaces.
- **Body** (regular, 14px, 1.5): the dashboard default for queue rows, explanations, and metadata.
- **Body small** (regular, 15px, 1.47): prose that deserves a little more reading space.
- **Label** (semibold, 12px, 1.4, tracked): eyebrows, status labels, and compact metric captions.

**The Scan-First Rule.** Product surfaces default to the compact dashboard body step; larger type is earned by content that requires sustained reading.

## Layout

The shell is a persistent navigation rail plus a flexible content pane. The queue owns the scroll region while the publication hand-off remains outside the long list. Content uses a generous outer gutter and compact internal groups so rows can be compared without visual drift.

The spacing foundation is a 4px unit, with 16–24px card padding and a 96px section rhythm for spacious non-queue surfaces. Queue controls wrap at desktop widths without changing their action order. Repeated queue geometry uses named values for score columns, meters, filters, decision columns, and chart/table canvases.

## Elevation & Depth

Depth is a quiet hybrid: a hairline says where a surface ends, and a single soft shadow tier lifts interactive cards on hover. The detail drawer and menu pop-outs may use the derived lift/drawer tiers; ordinary dashboard cards should not stack shadows. Atmospheric orbs provide mood, not elevation.

**The One-Tier Rule.** A card is either held by its hairline or lifted by its documented soft shadow; it does not accumulate competing effects.

## Shapes

Cards use gently rounded 16px corners. Fields use 8px corners. Pills are reserved for buttons, badges, and compact status affordances. The queue row remains a card-shaped list item with a stable action column so status changes do not move the score or target text.

## Components

### Buttons

- **Shape:** pill geometry (`{rounded.pill}`) with a 40px desktop height and a larger coarse-pointer target where applicable.
- **Primary:** ink fill, white label, compact medium-weight text; hover and active deepen the ink.
- **Outline:** transparent surface, strong hairline, ink label; hover strengthens the boundary.
- **Focus:** a 2px role-aware focus ring, never removed for pointer polish.

### Cards / Containers

- **Corner style:** 16px radius with a 1px hairline.
- **Background:** card surface over the canvas.
- **Shadow strategy:** the documented soft tier on hover; lift for overlays.
- **Internal padding:** 16px by default, 20–24px on wider reading surfaces.

### Inputs / Fields

- **Style:** card surface, readable control hairline, 8px radius, 44px height.
- **Focus:** ink border plus an inset ring without a layout shift.
- **Error:** semantic error treatment names the failure and the recovery action.

### Badges

Badges are compact pills. A badge reporting a status takes its status tint; every other badge stays on the strong surface. A colored dot accompanies the badge, but the label carries the state for sighted and assistive-technology users. In dark, the pill's rim is white at 12% rather than the stone hairline, so one rule works on the neutral ground and on all four tints.

## Motion

Motion explains state, relationship, and feedback. It never decorates and never makes an operator wait.

Duration encodes consequence, and the three steps are tokens rather than per-component choices:

- **Feedback** (`120ms`): a control acknowledging a press.
- **State** (`200ms`): a control or row changing state, including queue selection.
- **Arrive** (`280ms`): something entering or leaving the composition.

Easing is a single exponential ease-out (`settle`, `cubic-bezier(0.16, 1, 0.3, 1)`). Motion decelerates into place and never overshoots; bounce and elastic curves are not part of this system.

**The Finished-State Rule.** Under `prefers-reduced-motion`, every animation is cancelled into its completed state, never its starting one. The score meter in particular must land filled — a reader who asked for less movement is not shown every score as zero. Color and state transitions survive reduced motion, because they carry hover, selection, and disabled rather than movement.

The queue's score meter is the system's one authored moment: it draws itself from the left on arrival, as `scaleX` on a span already sized to the score, so a page of rows reads as a page of readings without a hundred width-driven layouts.

### Queue Rows

Queue rows keep source/target text, a semantic score meter, and a fixed decision column in one stable line at desktop widths. Selection changes the border while keeping the row's score and decision actions stable.

### Charts

Evaluation trend charts are visual summaries with a textual data description linked by `aria-describedby`. The description states each plotted value, its range, direction, and latest value so the metric remains useful without sight or hover.

## Do's and Don'ts

### Do

- **Do** use semantic token names and keep light/dark palette changes in the theme layer.
- **Do** keep the queue's primary action and exact-edit publication hand-off distinct and visible.
- **Do** keep selection, loading, error, and success states visible and accessible.
- **Do** reserve atmospheric gradients for decoration and use explicit dimensions for remote images.
- **Do** use named spacing values when geometry repeats across queue and evaluation surfaces.

### Don't

- **Don't** introduce a saturated CTA color, or use an orb as a button fill, a text color, or a status meaning. An orb may carry site identity and atmosphere; it may never say what state something is in.
- **Don't** let a status tint replace the status dot or the status word. The tint is a second channel on top of both.
- **Don't** key a site's color to its position in a list. It is derived from the site id, or it is not identity.
- **Don't** make a status depend on color, a hover tooltip, or a chart point's title alone.
- **Don't** add mobile-only defects to the desktop product gate; mobile is outside the supported surface by decision.
- **Don't** debounce the visible queue selection itself; only its URL snapshot may settle later.
- **Don't** keep a requestAnimationFrame loop alive when motion is disabled or the document is hidden.
