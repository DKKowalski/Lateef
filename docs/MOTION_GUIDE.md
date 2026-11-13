# Lateef SVG motion guide for humans and coding agents

This is an original, project-specific engineering guide. It records decisions, examples and checks for this implementation; it is not a transcript or replacement for a commercial animation course. Study of the user's local Josh W. Comeau lessons informed the work. Course HTML, videos, illustrations and solution code are not part of this repository.

## Start here when changing motion

Read this file, then inspect:

- `site/index.html`: each stage's geometry, its button and its caption. Every animated part carries a primitive class (`a-draw`, `a-pop`, …) and its delay as `--d`.
- `site/style.css`: the motion tokens at the top, then “Controls”, “Drawing primitives” and “Access stage”.
- `site/motion.js`: when stages play, the boop, and the input-driven arrow springs.
- `site/motion-math.js`: pure interpolation and spring helpers.
- `the companion project’s test/motion.test.mjs` and the companion project’s browser checks: numerical and real-browser checks.

The illustration does not control Chrome. Keep simulated interactions labelled as illustrations. Never imply that an animation proves a real file was transmitted or access was granted in the actual browser extension.

## The current scene

The home page is a gallery of nine stages. Eight show one tool each (status, tabs, navigate, snapshot, find, fill, click, upload); the ninth is a sample access switch. A stage is a white card holding one SVG drawing and one button named after the tool. The caption sits under the card.

Every drawing rests in its finished state. Adding `.is-playing` to the stage replays its parts from their first frame; the class comes off again about 2.3 seconds later. A stage plays once when it first scrolls into view, again when its button is pressed, and again when a mouse pointer enters the card. “Replay all” plays the eight tool stages a beat apart. Nothing on the page loops, so there is no pause control: no motion runs longer than a few seconds or starts again by itself.

To inspect a moment, freeze it: give every animated part `animation-play-state: paused` and `animation-delay: calc(var(--d, 0ms) - <time>)` with `.is-playing` on the stage. That shows the exact frame at `<time>` for every part at once.

## Tokens and primitives

Springs are design tokens, like colours. There are three, each stored with the duration it was sampled for: `--spring-snappy` (controls and ink arriving), `--spring-soft` (things gliding into place) and `--spring-bouncy` (paper landing, seals popping). They are `linear()` curves sampled from a damped spring, with a cubic-bezier fallback declared first for browsers without `linear()`. `--relax` is the one curve for reverting. Use these before adding a new curve, and keep a spring with its own duration.

Drawings are built from a small set of primitives rather than one keyframe per drawing:

- `a-draw` draws a normalised stroke; `a-flash` draws it and fades it out.
- `a-pop`, `a-grow`, `a-wipe` scale from nothing, from the bottom edge, and from the left edge.
- `a-rise`, `a-nudge`, `a-glide` bring a part in from a short distance.
- `a-type` reveals one character; `a-sweep` and `a-ring` are the scan line and the focus ring.
- `a-press`, `a-drop`, `a-flap` squash on contact, land with a squash, and swing a hinged part.

Squash and stretch stays small (about 10–15%) and always resolves to the true shape. A new drawing should be composed from these with `--d` delays before anything bespoke is written.

## Controls share one idea

Every control answers in the same family of ways, so the page feels like one object:

- **Buttons each have one effect**, rebuilt after Tiny Mighty Buttons: the lime `.btn` swells and rounds off, a `.pill` fills from below while its label flips colour, a `.chip` fills from its middle, and the replay chip tilts. The flipping label is drawn with `text-shadow`, so the text exists once in the document. A new control should reuse one of these four, not add a fifth.
- **Icons get a boop.** A small rotation that is applied on enter and removed on a 150 ms timer, so it completes however briefly the pointer passes. Set the pose per icon with `--boop`.
- **Arrows stretch.** A live spring in `motion.js` that keeps its velocity when interrupted.

Entering is quick and springy; leaving is slower and relaxed. The transition on the base rule is the leaving one, and the hover rule overrides it. Hover effects sit behind `(hover: hover) and (pointer: fine)` and only go on things that can be pressed. The one exception is a stage, which replays on hover because the motion explains the tool.

## The project's motion contract

Lateef connects a selected tab to an agent without displacing the user's work. Motion should explain that relationship. The paper, window and layout stay stable; a small amount of accent ink indicates an action or destination.

Use three material roles:

- **Ink:** precise progress and path reveals, without overshoot beyond completion.
- **Paper:** a small, anchored arrival response; its parts can follow with a restrained delay.
- **Controls:** quick feedback with preserved velocity when input changes direction.

Do not invent a new bounce, orbit, colour pulse or confetti system for each component. An effect should explain an action, draw attention to a relevant state, or make a control feel responsive. Remove motion that serves none of those purposes.

## Define outcomes before choosing an easing curve

Write down the action, visual response and end state. In this project:

- Share sample access: draw the route in, then the tick, then tint the tab.
- Revoke sample access: withdraw the route at once and put the lock back with a small rebound. No tick remains.
- Replay: restart one stage from its first frame. It never changes the access switch.
- Reduced motion: every stage shows its finished state, including the correct revoked state. Pressing a stage's button confirms with a short fade and nothing travels.

The share and revoke actions deliberately have different durations. A permissions withdrawal should be clear promptly; it does not need a celebratory rebound. These are simulation controls, not product permissions.

## Choose coordinates deliberately

Each SVG has a stable viewBox. Responsive CSS changes its display size while geometry remains in SVG units. Put pivots in that same coordinate system.

For a part that is placed and also animated, separate the two with nested groups:

```html
<g transform="translate(120 114)">
  <g class="a-drop">
    <!-- paper geometry -->
    <g class="a-flap"><!-- the fold --></g>
  </g>
</g>
```

The outer group only places the part, with an SVG `transform` attribute. The inner group only animates, with CSS. Animated parts use `transform-box: fill-box`, so their pivot is their own box: the centre by default, the bottom edge for things that land, and the hinge corner for the fold. A transform around the document's top-left corner is not equivalent to a transform around the paper's centre.

Avoid mixing a CSS transform and an SVG transform attribute on the same node unless you have deliberately tested their interaction. Extra wrappers are often clearer than one long transform with competing owners.

Use non-scaling strokes for diagram connections that should retain their screen thickness as the illustration resizes. Do not apply it indiscriminately to every icon: some icon strokes should scale proportionally with their geometry. Test both the small/mobile and desktop rendering.

## Draw paths without ghost marks

For a stroke-only progress path, normalize its path length and animate the offset. This tiny example is original project documentation:

```html
<svg viewBox="0 0 100 36" aria-hidden="true">
  <path class="progress-ink" pathLength="1"
        d="M8 26 C32 26 41 10 88 10" />
</svg>
```

```css
.progress-ink {
  fill: none;
  stroke: currentColor;
  stroke-dasharray: 1;
  stroke-dashoffset: var(--remaining, 1);
}
```

Clamp progress to 0–1. Test the path at zero as well as halfway and at completion; rounded caps and antialiasing can leave tiny marks. In this project `draw` starts at zero opacity for its first few percent, which hides the round cap that would otherwise sit at the start of the path.

A filled silhouette does not become a handwriting animation merely by giving its border a dash pattern. Use a real centreline stroke, or deliberately reveal a fill through a mask.

## Masks, if one is added

No drawing uses a mask at the moment. If one is needed:

- Specify mask units, content units, bounds and mask type explicitly.
- Apply the mask to a wrapper when the clipping region must stay stationary while a child moves.
- Account for paint order: masking an existing stroke does not generate a fresh outline around the resulting cutout.
- Inspect thin edges at actual size; a large screenshot can hide muddy joins.

Do not use a background-coloured shape as a fake cutout. The cards change colour between the light and dark themes.

## Namespace every SVG definition

Gradients and masks resolve by ID. Two copies of the scene must not share IDs or accidentally reference one another's definitions.

`mount(gallery)` rewrites any definition IDs and their local URL references with an instance prefix, then scopes element queries to that gallery. Controls use data attributes instead of duplicated HTML IDs. Mounting the same gallery twice returns the same controller; call its destroy method before removing a gallery.

If porting to a server-rendered framework, use that framework's hydration-stable ID facility. A random ID independently generated on server and client can break hydration. The current site is vanilla JavaScript, not server-rendered React.

## Distinguish authored motion from interactive motion

The stages are authored motion: each runs from a defined first frame to a defined last one, so a sampled `linear()` spring is enough.

An interactive control is different: it can be interrupted. Its spring must retain position and velocity. `stepSpring` retargets the current state rather than restarting a time curve. Frame deltas are bounded and subdivided for stability. Spring presets are grouped by material role; start by tuning a shared role rather than adding a one-off curve.

Do not describe a sampled CSS easing as equivalent to a live spring under interruption. For simple one-shot decoration a timed curve may be the right tradeoff. For repeated reversals, test inertia explicitly.

The arrow's shaft and head are independently defined geometry. The head changes proportions subtly as the arrow extends. The enclosing link owns pointer and keyboard events; the icon does not create a second interaction target.

## Scheduler and accessibility requirements

- Keep an explicit replay action on every stage. If anything is ever made to loop or to run longer than five seconds, it needs a visible pause control as well.
- Honour reduced motion from first paint and when the preference changes.
- Give access changes concise status text; do not announce every animation frame.
- Focus and pointer input should both receive feedback. Links must still navigate normally.
- A stage plays on first view only once; do not replay it every time it scrolls back in.
- Do no per-frame JavaScript for the drawings. Only the arrow springs use animation frames, and they stop when settled.
- Cache node references. Avoid layout reads and DOM-wide queries in every frame.
- Provide destroy/cleanup for reusable scenes: listeners, observer and scheduled frames.

## Review with evidence

Run `npm run build` and `npm run check`. Check the built site in a browser at both `/` and `/Lateef/`. No real account or browser session is needed for these tests.

Check these conditions before claiming completion:

1. No horizontal overflow at desktop or mobile widths; links and local downloads resolve.
2. A reveal has an intermediate state, a genuinely hidden initial state and a complete final state.
3. Revoke removes success feedback; share restores the intended permitted state.
4. Replay restarts cleanly mid-play, and reduced motion shows the finished state without travel.
5. Rapid hover/focus reversals remain finite and settle. Do not only inspect a completed transition.
6. Two galleries use unique definition IDs and play independently.
7. Nested transforms stay anchored at mobile and desktop sizes, in the light and dark themes.
8. No course media, copied proprietary example code, tokens or real browser content enters a public release.

The `LateefMotion.mount(gallery)` controller supports `play(index)`, `replayAll()` and `destroy()`. This is an illustration API, not a browser-control API.

## How another model should report the change

State the user-visible improvement, the code changed, the checks performed and any unverified behaviour. Name the actual browser/platform tested. A passing numerical test does not establish visual quality or cross-browser compatibility. Show an interactive preview for visual review. Do not claim to have completed an entire course after reading selected lessons.

Public learning references: [Whimsical Animations](https://whimsy.joshwcomeau.com/), [Josh's SVG introduction](https://www.joshwcomeau.com/svg/friendly-introduction-to-svg/), and [spring physics](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/). Course study is acknowledged; the code and examples in this project are independently written.
