# Lateef SVG motion guide for humans and coding agents

This is an original, project-specific engineering guide. It records decisions, examples and checks for this implementation; it is not a transcript or replacement for a commercial animation course. Study of the user's local Josh W. Comeau lessons informed the work. Course HTML, videos, illustrations and solution code are not part of this repository.

## Start here when changing motion

Read this file, then inspect:

- `site/index.html`: the illustration's geometry, semantic controls and labels.
- `site/motion-math.js`: pure interpolation, route geometry and spring helpers.
- `site/motion.js`: scoped scene controllers and input-driven arrow springs.
- `site/style.css`: visual styling; search for “SVG motion revision”.
- `the companion project’s test/motion.test.mjs` and the companion project’s browser checks: numerical and real-browser checks.

The illustration does not control Chrome. Keep simulated interactions labelled as illustrations. Never imply that an animation proves a real file was transmitted or access was granted in the actual browser extension.

## The project's motion contract

Lateef connects a selected tab to an agent without displacing the user's work. Motion should explain that relationship. The paper, window and layout stay stable; a small amount of accent ink indicates an action or destination.

Use three material roles:

- **Ink:** precise progress and path reveals, without overshoot beyond completion.
- **Paper:** a small, anchored arrival response; its parts can follow with a restrained delay.
- **Controls:** quick feedback with preserved velocity when input changes direction.

Do not invent a new bounce, orbit, colour pulse or confetti system for each component. An effect should explain an action, draw attention to a relevant state, or make a control feel responsive. Remove motion that serves none of those purposes.

## Define outcomes before choosing an easing curve

Write down the action, visual response and end state. In this project:

- Share sample access: reveal the authorized route and permit progress feedback.
- Revoke sample access: withdraw the route quickly and remove success feedback. Do not continue showing an attached-file tick.
- Pause: retain the exact illustration state. Do not reset the animation.
- Replay: reset the illustration while preserving the user's chosen access setting.
- Reduced motion: present a meaningful static state, including the correct revoked state.

The share and revoke actions deliberately have different durations. A permissions withdrawal should be clear promptly; it does not need a celebratory rebound. These are simulation controls, not product permissions.

## Choose coordinates deliberately

Each SVG has a stable viewBox. Responsive CSS changes its display size while geometry remains in SVG units. Put pivots in that same coordinate system.

For our file, separate responsibilities with nested groups:

```html
<g class="file-travel">
  <g class="file-sheet">
    <!-- original paper geometry and fold -->
  </g>
</g>
```

Translate the outer group along its trajectory. Apply the small material response around the paper's own centre on the inner group. Give the fold its own hinge. A transform around the document's top-left corner is not equivalent to a transform around the paper's centre.

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

Clamp progress to 0–1. Test the path at zero as well as halfway and at completion; rounded caps and antialiasing can leave tiny marks. In this project the route also has an opacity envelope so the reset is hidden. The static browser surface never fades out to disguise a reset.

A filled silhouette does not become a handwriting animation merely by giving its border a dash pattern. Use a real centreline stroke, or deliberately reveal a fill through a mask.

## A mask is a compositing operation

The file's progress fill is revealed inside its page silhouette. The visible border is drawn independently, so the moving fill cannot erase the outline.

- Specify mask units, content units, bounds and mask type explicitly.
- Apply the mask to a wrapper when the clipping region must stay stationary while a child moves.
- Account for paint order: masking an existing stroke does not generate a fresh outline around the resulting cutout.
- Inspect thin edges at actual icon size; a large screenshot can hide muddy joins.

Do not use a background-coloured shape as a fake cutout if the component may appear over different surfaces.

## Namespace every SVG definition

Gradients and masks resolve by ID. Two copies of the scene must not share IDs or accidentally reference one another's definitions.

`mount(scene)` rewrites definition IDs and their local URL references with an instance prefix, then scopes element queries to that scene. Controls use data attributes instead of duplicated HTML IDs. Reuse the controller when mounting the same scene twice; call its destroy method before removing a scene.

If porting to a server-rendered framework, use that framework's hydration-stable ID facility. A random ID independently generated on server and client can break hydration. The current site is vanilla JavaScript, not server-rendered React.

## Distinguish authored motion from interactive motion

The illustrative workflow uses a clock so exact moments can be inspected. A closed-form spring is sufficient for an arrival that will run from its defined initial state.

An interactive control is different: it can be interrupted. Its spring must retain position and velocity. `stepSpring` retargets the current state rather than restarting a time curve. Frame deltas are bounded and subdivided for stability. Spring presets are grouped by material role; start by tuning a shared role rather than adding a one-off curve.

Do not describe a sampled CSS easing as equivalent to a live spring under interruption. For simple one-shot decoration a timed curve may be the right tradeoff. For repeated reversals, test inertia explicitly.

The arrow's shaft and head are independently defined geometry. The head changes proportions subtly as the arrow extends. The enclosing link owns pointer and keyboard events; the icon does not create a second interaction target.

## Scheduler and accessibility requirements

- Keep a visible pause/resume control and an explicit replay action.
- Honour reduced motion from first paint and when the preference changes.
- Give access changes concise status text; do not announce every animation frame.
- Focus and pointer input should both receive feedback. Links must still navigate normally.
- Suspend the scene when it is outside the viewport or the tab is hidden.
- Stop animation work when paused and settled. An active access transition may finish while the workflow is paused.
- Reset timing on resume so a background tab does not jump forward.
- Cache node references. Avoid layout reads and DOM-wide queries in every frame.
- Provide destroy/cleanup for reusable scenes: listeners, observer and scheduled frames.

## Review with evidence

Run `npm run build` and `npm run check`. Check the built site in a browser at both `/` and `/Lateef/`. No real account or browser session is needed for these tests.

Check these conditions before claiming completion:

1. No horizontal overflow at desktop or mobile widths; links and local downloads resolve.
2. A reveal has an intermediate state, a genuinely hidden initial state and a complete final state.
3. Revoke removes success feedback; share restores the intended permitted state.
4. Pause is stable, replay behaves as specified, and reduced motion stays stable.
5. Rapid hover/focus reversals remain finite and settle. Do not only inspect a completed transition.
6. Two scenes use unique definition IDs and can render different times independently.
7. Nested transforms stay anchored; masks still work at actual icon size and on different surfaces.
8. No course media, copied proprietary example code, tokens or real browser content enters a public release.

The `LateefMotion.mount(scene)` controller supports `seek(seconds)` for deterministic paused inspection and `destroy()` for cleanup. This is an illustration API, not a browser-control API.

## How another model should report the change

State the user-visible improvement, the code changed, the checks performed and any unverified behaviour. Name the actual browser/platform tested. A passing numerical test does not establish visual quality or cross-browser compatibility. Show an interactive preview for visual review. Do not claim to have completed an entire course after reading selected lessons.

Public learning references: [Whimsical Animations](https://whimsy.joshwcomeau.com/), [Josh's SVG introduction](https://www.joshwcomeau.com/svg/friendly-introduction-to-svg/), and [spring physics](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/). Course study is acknowledged; the code and examples in this project are independently written.
