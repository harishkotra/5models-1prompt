# Lunar Descent

A self-contained lunar lander simulator with **real physics** and a **deterministic
autopilot**. No backend, no API keys, no npm dependencies, no CDN, no build step.

## Files

| File | Purpose |
|------|---------|
| `sim.mjs` | Pure physics + autopilot. No DOM, no canvas, no globals. Exports the constants, `step()`, `autopilot()`, and `run()`. |
| `index.html` | Canvas 2D visual, HUD, controls. Imports `sim.mjs`. |
| `test.mjs` | Headless Node run: prints the verdict, final numbers, and trajectory JSON. |
| `README.md` | This file. |

`index.html` and `test.mjs` **share `sim.mjs`** — the physics exists in exactly one place.

## Run the visual app

ES modules will **not** load from `file://` (the browser blocks them for security).
Serve the folder over HTTP:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

- **RUN AUTOPILOT** — runs the deterministic autopilot instantly and shows the verdict.
- **REPLAY SLOW** — replays the exact same run in real time, for filming.
- **COPY TRAJECTORY JSON** — copies the sampled trajectory array.
- **Manual mode** — `↑`/`W` throttle up, `↓`/`S` throttle down, `←`/`A` tilt left,
  `→`/`D` tilt right, `Space` full throttle.

## Run the headless test

```bash
node test.mjs
```

It prints `LANDED` or `CRASHED`, the four touchdown numbers, fuel remaining, the
fixed constants, a determinism check, and the trajectory JSON.

## Physics (fixed — every build uses these exact values)

```
GRAVITY            = 1.62 m/s^2
DRY_MASS           = 500 kg
MAX_THRUST         = 3000 N
BURN_RATE          = 8 kg/s  (at throttle 1.0)
FUEL_START         = 250 kg
MAX_ANGULAR_ACCEL  = 90 deg/s^2
MAX_ANGULAR_RATE   = 45 deg/s
DT                 = 1/60 s  (fixed timestep)
```

Start state: `x=0, y=100, vx=+5, vy=-10, theta=0, omega=0, fuel=250`.

Touchdown (`y <= 0`) is a landing only if all hold: `|vy| <= 3`, `|vx| <= 2`,
`|theta| <= 10 deg`, `|x| <= 15 m`, `fuel >= 0`. Anything else is a crash.

## Determinism

The autopilot uses no `Math.random`, no `Date.now`, and no wall-clock. Two runs
produce byte-identical verdicts and trajectories; `test.mjs` verifies this.