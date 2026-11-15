# Car Racing — implementation plan

Repo: `alikonainofficial/Car_Racing` · Live: `https://alikonainofficial.github.io/Car_Racing/` · Game id for storage: `racing`

## 0. What the repo is today

`index.html` loads `js/GraphicsCommon.js`, `Car.js`, `Track.js`, `Input.js`, `ImageLoading.js`, `Main.js`. 800×600 canvas, `setInterval` 30 fps. `Track.js` holds a 20×15 tile grid (`TRACK_W/H 40`) with codes `0 road, 1 wall, 2 player start, 3 goal, 4 tree, 5 flag` and PNG tiles in `images/`. Two `carClass` instances: p1 arrows (red), p2 WASD (blue). Driving into the goal tile → `alert(name + " Won!")` and both cars reset.

Known defects:

- **Cannot steer while accelerating:** `carMove` uses `if (gas) … else if (reverse) … else if (turnLeft) … else if (turnRight)`. Holding Up+Left only applies gas.
- `alert()` on win freezes the loop and drops held keys. `showingWinScreen` is never set; `checkForAndremoveTrackAtPixelCoord` is dead code.
- `ImageLoading.js`: `imgVar.onload = countLoadedImageAndLaunchIfReady()` **calls** the function instead of assigning it, so the game starts before images load.
- `keyPressed` calls `preventDefault()` for every key (blocks F5, Tab, shortcuts).
- Turn rate is constant regardless of speed; no timer, laps, checkpoints, countdown, sound, solo mode, touch.
- The flag tiles (`5`) are decoration. They become checkpoints.

## 1. Target

Arcade handling that feels good (turn under throttle, speed-scaled steering, drift, bounce, dust, engine pitch), a 3-2-1-GO countdown, laps validated by checkpoints, **Time Trial with a ghost of your best run and live split deltas**, and **Race (best of 3)** for two players with a results overlay and a copyable line. Keyboard and touch.

## 2. File layout after

```
index.html
css/arcade-shell.css   (copied, unmodified)
js/arcade-shell.js     (copied, unmodified)
js/track.js            grid, tile helpers, checkpoint order (from Track.js)
js/car.js              car physics + drawing
js/ghost.js            record/replay/store
js/game.js             modes, phases, HUD, overlays (replaces Main.js, Input.js, ImageLoading.js, GraphicsCommon.js)
images/                keep
```

## 3. Steps

### Step 1 — Shell, loading, loop, input
1. `Arcade.init({ game: 'racing', title: 'Car Racing', onRestart: restartCurrentMode })`. Load images with `Promise.all` over `img.decode()`; start the loop only after all resolve (show "Loading…" via `Arcade.ui.overlay` until then).
2. Replace `Input.js` entirely: p1 reads `ArrowUp/Down/Left/Right`, p2 `KeyW/S/A/D`, via `Arcade.input.isDown`. `Arcade.input.capture([...those 8...])`. Touch: `Arcade.touch.dpad({up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight'}, 'left')` (p1 only on touch; 2-player is keyboard).
3. Delta time: convert constants to per-second. Old per-frame at 30 fps → `DRIVE_POWER 0.5 → 15 px/s²·30 = 450 px/s²`; `REVERSE_POWER → 180`; decay `0.94/frame → speed *= Math.pow(0.94, dt*30)`; `TURN_RATE 0.03π rad/frame → 2.83 rad/s`; `MIN_TURN_SPEED 0.5 px/frame → 15 px/s`.

### Step 2 — Handling fix and feel
1. Make the four inputs independent `if`s. Steering: `angVel = TURN_RATE × sign × min(1, |speed| / 120)` (full steering from 120 px/s up; reverse flips the sign), so the car does not pivot on the spot.
2. Drift: keep a velocity vector `(vx, vy)`; each frame blend it toward the heading: `v = lerp(v, heading×|v|, 1 − Math.pow(0.08, dt))`. At high speed in a turn this gives a small, readable slide. Tune so the track is drivable.
3. Walls (`1`, `4`): on collision, reflect the velocity component along the hit normal with 0.5 restitution (test the next position's tile for x and y separately to find the normal), `Arcade.fx.shake(3, 100)`, `Arcade.sfx.play('thud')`, `Arcade.fx.burst(x, y, { color: '#9a8f7a', count: 6, speed: 120, life: 0.3 })`.
4. Dust: while `|speed| > 200` and turning, emit 1 particle per 40 ms behind the car; skid marks optional (an offscreen canvas you draw dark lines into, cleared on restart).
5. Engine: one `OscillatorNode` per car created on first input (`Arcade.sfx.context()`), `type: 'sawtooth'`, frequency `60 + |speed| × 0.5` Hz, gain 0.05, through a lowpass at 400 Hz; stop on overlay/pause. Mute follows `Arcade.sfx.isMuted()`.
6. Draw order: track, skid canvas, particles (shell draws them after `draw`), cars with `drawImage` rotated about the centre (keep `drawBitmapCenteredAtLocationWithRotation`).

Acceptance: you can hold Up and steer through the whole track; cornering feels deliberate; walls punish but do not stop you dead.

### Step 3 — Checkpoints, laps, countdown, phases
1. `track.js`: derive `checkpoints` = the flag tiles in a fixed order around the track. Determine the order once by walking the road from the start in the race direction (the start car faces up: `carAng = −π/2`); hard-code the resulting order as an array of tile indices with a comment, so laps are deterministic. Goal tile = finish line; a lap counts only when all checkpoints were passed in order since the last finish crossing.
2. Checkpoint detection per car: the car's centre tile == next expected checkpoint tile → advance; crossing the goal with all checkpoints → `lap++`, lap time recorded. Flags change colour when passed (draw a tinted copy) and reset each lap.
3. Phases: `countdown (3-2-1-GO, 3 s, cars frozen, Arcade.sfx.play('countdown', isLast)) → racing → finished`. `R` restarts the mode at the countdown.
4. HUD per mode (Step 4). Timer uses `performance.now()` deltas accumulated while in `racing` (so pause works).

### Step 4 — Modes: Time Trial (ghost) and Race
1. Start overlay: title "Car Racing", buttons **Time Trial** (1 player, 3 laps, ghost) and **Race** (2 players, best of 3, 3 laps each). Lines: "P1: arrows · P2: WASD". Remember the last mode in `arcade.racing.mode`.
2. **Ghost recording** (`ghost.js`): during Time Trial sample p1 `{x, y, a}` at 20 Hz into an array (3 laps ≈ 60–90 s → ~1,800 samples, quantize to integers and store as a flat array to keep it small). On finishing 3 laps with a time lower than `arcade.racing.best` (ms), save `arcade.racing.ghost = { time, samples, hz: 20 }`. On the next Time Trial, replay the ghost by interpolating between samples, drawn with `globalAlpha 0.45`. The ghost never collides.
3. **Splits:** store per-checkpoint times of the best run (`arcade.racing.bestSplits`, array of ms, one per checkpoint per lap). When the player passes a checkpoint, show `Arcade.fmt.delta(now − bestSplit)` next to the car for 1.2 s (green if negative, coral if positive). Live HUD: `Lap 2/3`, `Time 00:41.2`, `Best 01:58.4`, `Last lap 00:39.9`.
4. Time Trial results overlay: title = total time, lines `Best 01:58.4` or `New best!`, `Best lap 00:38.7`, buttons "Again", "Copy result" → `🏎️ Car Racing · 1:58.4 · best lap 38.7 s`.
5. **Race:** two cars, 3 laps; the first to finish 3 laps wins the round, the other car's result is still shown; countdown between rounds; first to 2 round wins takes the match. Results overlay: `Red car wins 2–1`, lines with each round's winner and best lap, buttons "Rematch", "Copy result" → `🏎️ Red 2–1 Blue · best lap 36.2 s`. HUD in Race: `Red 1 · Blue 0`, `Lap 2/3 · Lap 1/3`, round timer.
6. Both modes: `Arcade.store.bumpPlays()` on completion; `arcade.racing.best` = best Time Trial total in ms (the portfolio card shows `Best 1:58.4`).

### Step 5 — Polish and ship
- Start the countdown only after the images are loaded and the overlay is dismissed.
- Reduced motion: no shake/dust; keep sounds.
- README: modes, controls, checkpoints, ghost stored locally.
- Remove `GraphicsCommon.js`, `ImageLoading.js`, `Input.js`, `Main.js` once replaced; keep the images.

## 4. Data formats

- `arcade.racing.best` → number, ms (Time Trial, 3 laps)
- `arcade.racing.bestLap` → number, ms
- `arcade.racing.bestSplits` → `[ms, …]` (checkpoint splits of the best run, cumulative from the start)
- `arcade.racing.ghost` → `{ time, hz: 20, samples: [x,y,a, x,y,a, …] }` (angles in 1/100 rad as integers)
- `arcade.racing.mode` → `'tt' | 'race'`
- `arcade.racing.plays` → number
- Share (TT): `🏎️ Car Racing · {m:ss.t} · best lap {s.t} s` · Share (Race): `🏎️ Red {a}–{b} Blue · best lap {s.t} s`

## 5. Test checklist

- [ ] Steering works while holding gas; reverse steers the opposite way
- [ ] Cutting across walls cannot register a lap (checkpoint order enforced)
- [ ] Countdown freezes cars; GO releases both at once
- [ ] Ghost appears on the second Time Trial and matches the previous best run's path
- [ ] Split deltas show at each flag with the right sign/colour
- [ ] Race: round win, match win at 2, rematch; both key sets work simultaneously (test holding 4 keys)
- [ ] Touch d-pad drives p1
- [ ] No `alert()`, no console errors, `R`/`P` work, images loaded before first frame
