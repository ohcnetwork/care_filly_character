# Filly 3D Character — Design Spec

Date: 2026-08-19
Status: approved-by-default (autonomous session; assumptions listed below)

## 1. Goal

Turn the CARE mascot design sheet (`71e53c69-….png` — 8 animation states:
Idle, Blink, Listening, Talking, Happy Bounce, Thinking, Surprised, Sleepy)
into a **real-time 3D web character** — in the spirit of GitHub's 3D "Mona"
— that can be dropped into `care_filly_fe` (the CARE voice-documentation
plugin) as a React component, and that reacts to the plugin's status and live
audio.

Non-goals: rigged/skinned character for game engines; artist DCC pipeline
(Blender is not installed and no external asset fetches are allowed at
runtime, since CARE deployments may be offline).

## 2. Assumptions (stated because the session is autonomous)

1. "Our app" = `../care_filly_fe` (React 19, Vite 6, Tailwind 4, module
   federation remote of `care_fe`). Its `FillyStatus` union is
   `idle | recording | paused | processing | completed | failed`.
2. "Like Mona" = an in-browser, animated 3D mascot that idles, reacts to
   state, and follows the pointer with its eyes — not a static render.
3. Delivering the character as a **separate package** in this directory
   (`care_filly_character`) is preferable to editing `care_filly_fe`
   directly; an integration snippet is provided instead.
4. Look target: soft matte "clay/vinyl toy" shading, mint palette from the
   sheet, glossy black eyes, transparent background so it composes over
   any UI.

## 3. Character anatomy (from the sheet)

| Part | Geometry | Colour |
|------|----------|--------|
| Body | sphere r=1 | mint `#dfeed3` (lighter toward top) |
| Face plate | rounded plus/cross, recessed ~0.07 into the body front | green `#7cb069` |
| Ear tiles ×2 | rounded boxes on top of body, flanking the plus's upper stem, raised | light green `#c3e2a8` |
| Side tiles ×2 | rounded boxes at the plus's horizontal arms, left/right, raised | light green `#c3e2a8` |
| Arms ×2 | small ellipsoids on lower sides, pivot at shoulder | light green `#bfe0a6` |
| Feet ×2 | flattened ellipsoids at bottom front | light green `#bfe0a6` |
| Eyes ×2 | spheres r≈0.13, glossy black, two white highlights fixed to view | `#141414`, highlights white |
| Eyelid arcs | thick dark arcs shown when eyes are closed (blink `^ ^`, sleepy `︶ ︶`) | `#141414` |
| Cheeks ×2 | flattened pink discs on the plate | `#f2b7b3` |
| Mouth | canvas-drawn (open smile w/ tongue, closed smile, "o", frown, tiny "o") | interior `#5a1b1b`, tongue `#f08a8a` |
| Contact shadow | soft radial-gradient plane below | black, α≈0.25 |
| Decorations | zZ (sleepy), thought bubbles (thinking), sound waves (listening), sparks (surprised/talking) | greens |

## 4. Architecture

```
src/
├── core/
│   ├── types.ts        FillyState, FillyPose, DEFAULT_POSE, PoseParam keys
│   └── palette.ts      colours + material params (single source of truth)
├── model/
│   ├── geometry.ts     buildBodyGeometry() (CSG plus recess, cached), tiles, limbs
│   ├── face.ts         mouth canvas painter, eyelid arcs, eye rig
│   ├── decorations.ts  zZ / bubbles / waves / sparks
│   └── FillyModel.ts   THREE.Group subclass; applyPose(pose); dispose()
├── animation/
│   ├── spring.ts       critically/under-damped spring per param
│   ├── states.ts       per-state target pose + procedural modulators
│   ├── blink.ts        blink scheduler + one-shot trigger
│   └── FillyAnimator.ts setState(), setAudioLevel(), setPointer(), update(dt) → FillyPose
├── react/
│   ├── FillyCharacter.tsx  <Canvas> wrapper, lights, env, frame loop, pointer, visibility pause
│   └── FillyMascot.tsx     FillyStatus → FillyState mapping + speaking/audioLevel
└── index.ts            public exports
playground/             dev page (state switcher, sheet mode, ?state=&t=&static=1)
scripts/                snapshot.mts (playwright screenshots), export-glb.mts
```

### 4.1 `FillyPose` (the contract between animation and model)

Continuous parameters, all plain numbers so they can be spring-smoothed:

- body: `bodyY, bodyScaleX, bodyScaleY, bodyPitch, bodyYaw, bodyRoll`
- ears: `earL, earR` (rotation, + = perk outward/up; − = droop)
- arms: `armL, armR` (raise), `armLChin` (0..1 hand-to-chin blend)
- eyes: `eyeOpenL, eyeOpenR` (0..1), `eyeArc` (−1 sleepy … +1 happy, shape used when closed),
  `eyeLookX, eyeLookY`, `eyeScale`, `browL, browR` (subtle plate-lid tilt for frown/worry)
- mouth: `mouthOpen, mouthWide, mouthSmile (−1..1), mouthRound (0..1)`
- cheeks: `cheek` (0..1)
- decorations: `zzz, bubbles, waves, sparks` (0..1 opacity)

### 4.2 `FillyState`

`'idle' | 'listening' | 'talking' | 'happy' | 'thinking' | 'surprised' | 'sleepy'`

"Blink" is not a state: it is an automatic overlay (random 2–6 s cadence,
suppressed in `sleepy`) plus `animator.blink()` / `ref.blink()` trigger.

### 4.3 Per-state behaviour

| State | Static target | Procedural loop |
|-------|---------------|-----------------|
| idle | neutral, small open smile, cheeks .6 | breathe (scaleY ±1.5 %, 0.25 Hz), slow bob, occasional glance |
| listening | ears perk +0.25 rad, lean forward, eyes wide 1.05, closed smile, waves 1 | ear wiggle scaled by audioLevel, gentle head tilt sway |
| talking | open smile, sparks .6 | mouthOpen from `audioLevel` (or synthetic syllable noise if none), body bob synced |
| happy | eyes happy arcs, wide open smile, cheeks 1 | bounce: y = 0.18·|sin| , squash at ground (1.12, 0.88), stretch in air (0.94, 1.08); ears flap |
| thinking | eyes look up-right, slight frown, armLChin 1, roll −0.08, bubbles 1 | gaze drift, bubble float |
| surprised | eyeScale 1.25, mouth round "o", ears straight up, sparks 1 | one-shot jump + stretch on enter, then micro-tremble |
| sleepy | eyes closed (arc −1), tiny "o", pitch +0.12, y −0.04, ears droop, zzz 1 | slow deep breathe (±3 %, 0.12 Hz), no blink |

Transitions: springs (stiffness ~120–200, damping ~14–20) per param; state
change just swaps targets. `happy` and `surprised` also fire an enter impulse.

### 4.4 Pointer follow

`FillyCharacter` listens to `pointermove` on `window` (opt-out via
`followPointer={false}`), converts to NDC relative to the canvas centre and
feeds `animator.setPointer(x, y)`. Animator blends into `eyeLookX/Y` (±0.06)
and `bodyYaw/Pitch` (±0.12 rad) with a slow spring. Disabled in `sleepy`.

### 4.5 Rendering

- `@react-three/fiber` `<Canvas>`: `alpha`, `antialias`, `dpr=[1,2]`,
  `frameloop="always"` but paused via `IntersectionObserver` when offscreen
  and `document.hidden`.
- Lights: hemisphere (sky mint / ground warm), key directional (upper-left,
  soft), rim; PMREM `RoomEnvironment` for reflections (procedural, no fetch).
- Materials: `MeshPhysicalMaterial` — body roughness .55, clearcoat .3;
  eyes roughness .08, clearcoat 1; `toneMapping = ACESFilmic`,
  `outputColorSpace = SRGB`.
- Camera: perspective 30°, at (0, 0.15, 5.2), looking slightly down;
  character sits on y = −1 (feet) so contact shadow reads.
- Body plus-recess: `three-bvh-csg` SUBTRACTION (sphere − extruded rounded
  plus); result geometry cached module-wide; ~20 ms one-time.

### 4.6 Public API

```ts
<FillyCharacter
  state?: FillyState            // default 'idle'
  audioLevel?: number           // 0..1, drives talking mouth / listening ears
  size?: number | string        // px or CSS size, default 160
  followPointer?: boolean       // default true
  interactive?: boolean         // click → happy bounce, hover → glance; default true
  onClick?: () => void
  className?, style?
  ref → { blink(): void; setState(s): void }
/>

<FillyMascot status: FillyStatus; speaking?: boolean; audioLevel?: number; …rest />
// idle→idle, recording→listening (or talking when speaking), paused→sleepy,
// processing→thinking, completed→happy, failed→surprised

// Non-React: new FillyModel(), new FillyAnimator(); model.applyPose(animator.update(dt))
```

### 4.7 Package & build

- name `@ohcnetwork/care-filly-character`, ESM only, `sideEffects: false`.
- `vite build` (lib mode) → `dist/index.js` + `dist/index.d.ts`;
  peer deps: `react`, `react-dom`, `three`, `@react-three/fiber`.
- `vite --config vite.playground.config.ts` for the dev page.
- Node ≥ 22.

### 4.8 Testing

- vitest: springs converge; every state yields finite, bounded pose;
  blink cycle timing; talking mouth follows audioLevel; pointer follow
  clamps; FillyStatus mapping; RNG seeded → deterministic.
- Playwright (headless chromium, SwiftShader GL): screenshot every state at
  a fixed time (`?state=…&t=…&static=1`) and a full sheet; reviewed against
  the reference by eye during the visual-QA loop.
- `tsc --noEmit`, `eslint`, `vite build` must pass.

### 4.9 GLB export

`scripts/export-glb.mts` opens the playground in headless chromium with
`?export=1`, which calls `GLTFExporter` on the idle-posed `FillyModel`, and
writes `dist/filly-mascot.glb`. Static mesh + PBR materials only (mouth is
baked as a small textured plane; animation stays in code).

## 5. Integration with care_filly_fe (guide, not applied here)

```tsx
const FillyMascot = React.lazy(() =>
  import("@ohcnetwork/care-filly-character").then(m => ({ default: m.FillyMascot })));
…
<FillyMascot status={filly.status} audioLevel={level} size={96} />
```

`level` can be the mean of the existing `barHeights` (AnalyserNode) already
computed in `FillyController.tsx`. Lazy-load keeps three.js (~150 kB gz)
out of the plugin's initial chunk.
