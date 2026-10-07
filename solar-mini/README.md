# Lunar Descent

A self-contained **lunar lander simulator** with a deterministic autopilot, a canvas HUD, and a headless Node test. One shared physics module (`sim.mjs`); everything else reads from or drives it.

## Files

- `sim.mjs` -- **the only physics/control source**. Constants, `step()`, `checkWin()`, `autopilot()`, `run()` (pure JS, no DOM, no canvas, no globals). Imported by `index.html` and `test.mjs`.
- `test.mjs` -- headless harness: runs `run()` once and prints verdict, final numbers, and trajectory JSON (every 6th step) to stdout.
- `index.html` -- self-contained UI (dark starfield, lunar surface, landing pad, lander, HUD, verdict overlay). Served as a native ES module; no build step, no framework.

## Quick start

1. Serve the folder (do **not** open `file://` directly — native ES modules are blocked on `file://`):

   ```bash
   python3 -m http.server 8080
   ```

2. Open `http://localhost:8080` (or any browser serving that folder).
3. **Manual mode:** `W`/`A`/`S`/`D` (or `Arrow Up/Down/Left/Right`) — `Space` = full throttle; `W`/`A`/`S`/`D` nudge throttle ±6%; `A`/`D` roll left/right; `M` toggles Manual/Replay.
4. Press **RUN AUTOPILOT** (or `Enter` while in Manual) to let the deterministic autopilot fly the lander.
5. Press **REPLAY SLOW** to step through the saved autopilot trajectory.
6. Press **COPY TRAJECTORY JSON** to copy the full trajectory (every 6th step) to the clipboard.
7. Headless verification: `node test.mjs`.

## Architecture

- `sim.mjs` defines `GRAVITY`, `DRY_MASS`, `MAX_THRUST`, `BURN_RATE`, `FUEL_START`, `MAX_ANGULAR_ACCEL`, `MAX_ANGULAR_RATE`, `DT`, `START_STATE`, plus the four exported functions and `run()`.
- `index.html` reads the physical constants from `sim.mjs` to fill a "PHYSICS (fixed)" panel, so the UI never hard-codes numbers.
- `test.mjs` imports `{ run }` from `sim.mjs` only.

## Acceptance criteria

1. **Shared physics module.** `sim.mjs` is the single source of physics; `index.html` and `test.mjs` both import from it. Verified: `grep -l "from './sim.mjs'" index.html test.mjs` returns both files.
2. **Canvas HUD.** `index.html` renders a fixed 900x600 canvas with a HUD (altitude, `vx`, `vy`, tilt, fuel, throttle, mode), a physics constants panel, verdict overlay, and control buttons.
3. **Deterministic autopilot lands.** `node test.mjs` exits `0`, prints `VERDICT: LANDED`, and a trajectory JSON of every 6th step.
4. **Manual/autopilot/replay/copy controls.** `RUN AUTOPILOT`, `REPLAY SLOW`, and `COPY TRAJECTORY JSON` buttons function; `index.html` compiles and the UI script passes `node --check`.
5. **Win conditions.** `|vy| <= 3`, `|vx| <= 2`, `|theta| <= 10`, `|x| <= 15`, `fuel >= 0`.
6. **Fixed fuel/engine-off.** Throttle forced to `0` once fuel `<= 0` (engine-off check before thrust application).
7. **Fixed rotation sign.** Autopilot PD rotation uses `torque = -KRT * (theta - thetaDes)`.
8. **Shared module note.** Native ES modules are blocked on `file://`; always serve the folder over HTTP (the `file://` note appears in this README).

## Node test verdict (verbatim)

```
VERDICT: LANDED

--- Final numbers (touchdown) ---
vy   = -0.89 m/s   (limit |vy| <= 3.0)
vx   = -0.13 m/s   (limit |vx| <= 2.0)
tilt = -6.26 deg   (limit |theta| <= 10)
x    = 6.08 m     (limit |x| <= 15)
fuel = 168.46 kg
sim time = 19.433 s
fuel used = 81.54 kg
--- Verdict reasons ---
(none - all win conditions hold)
--- Trajectory JSON (every 6th step, 195 points) ---
[...]
```

Trajectory JSON is valid (parsed successfully with 195 points; each record has `t,x,y,vx,vy,theta,fuel,throttle`; throttle spans 0..0.914).
