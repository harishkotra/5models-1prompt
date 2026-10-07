# Lunar Descent

A self-contained lunar lander simulator. One lander, one pad, fixed physics,
zero dependencies. `sim.mjs` holds the physics and the deterministic autopilot;
`index.html` (canvas 2D + HUD + manual mode) and `test.mjs` (headless Node
verdict) both import it — the physics exists in exactly one place.

## Run it

ES modules do **not** load from `file://`. Serve the folder over HTTP:

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080>.

Headless autopilot test (no browser):

```sh
node test.mjs
```

## Controls

- **RUN AUTOPILOT** — executes the deterministic autopilot instantly and prints
  the verdict (LANDED / CRASHED) with the four touchdown numbers.
- **REPLAY SLOW** — the same run, at 1x real time, for filming.
- **FLY MANUAL** — keyboard: ↑/W throttle up, ↓/S throttle down, ←/→ or A/D
  torque, SPACE full throttle, R reset.
- **COPY TRAJECTORY JSON** — copies the trajectory array (every 6th step:
  `{t, x, y, vx, vy, theta, fuel, throttle}`), identical to what `test.mjs`
  prints.

## Fixed physics (never tuned, never variable)

`GRAVITY=1.62 m/s²`, `DRY_MASS=500 kg`, `MAX_THRUST=3000 N`,
`BURN_RATE=8 kg/s`, `FUEL_START=250 kg`, `MAX_ANGULAR_ACCEL=90 deg/s²`,
`MAX_ANGULAR_RATE=45 deg/s`, `DT=1/60 s` (fixed timestep).
These values are also printed on-screen in the constants panel.

Win condition at touchdown (`y <= 0`): `|vy| <= 3 m/s`, `|vx| <= 2 m/s`,
`|theta| <= 10 deg`, `|x| <= 15 m`, `fuel >= 0`. Anything else is a CRASH.

## Determinism claim, stated plainly

The autopilot uses only `Math.*` pure functions, fixed `DT`, and the current
state — no `Math.random`, no `Date.now`, no wall clock. Two runs of
`node test.mjs` produce byte-identical stdout: same verdict, same final
numbers, same trajectory JSON.

Built By Harish Kotra — <https://harishkotra.me> ·
[Checkout my other builds](https://dailybuild.xyz)
