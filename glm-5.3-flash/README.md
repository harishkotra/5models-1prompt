# Lunar Descent

A self-contained lunar lander simulator. One lander, one pad, real physics —
with a manual (keyboard) mode and a deterministic autopilot that lands with
zero human input, reproducibly, every single run.

## Files

| File        | Role                                                              |
|-------------|-------------------------------------------------------------------|
| `sim.mjs`   | Pure physics + autopilot. No DOM, no canvas, no globals. The **single source of truth** for physics — both the browser app and the Node test import it. |
| `index.html`| Canvas 2D visual + HUD + controls. Imports `sim.mjs`.             |
| `test.mjs`  | Headless: runs the autopilot in Node, prints verdict + trajectory JSON. |

## Running

ES modules will not load from `file://` — serve over HTTP:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

Headless test (no browser needed):

```sh
node test.mjs
```

## Controls (manual mode)

- `↑` / `W` — throttle up · `↓` / `S` — throttle down
- `←` / `→` or `A` / `D` — RCS torque
- `Space` — full throttle

## Autopilot

Deterministic: a pure function of state. No `Math.random`, no `Date.now`,
no wall-clock. Strategy: a constant-deceleration descent profile
(`vy_cmd = -sqrt(2·a·alt)`), a lateral PD law that kills drift and recenters
on the pad, and an inner critically-damped attitude loop. See the commented
`autopilot()` in `sim.mjs`.

## Physics (fixed for every build)

`GRAVITY 1.62 m/s² · DRY_MASS 500 kg · MAX_THRUST 3000 N · BURN_RATE 8 kg/s ·
FUEL_START 250 kg · MAX_ANGULAR_ACCEL 90 °/s² · MAX_ANGULAR_RATE 45 °/s · DT 1/60 s`

Win condition at touchdown (`y ≤ 0`): `|vy| ≤ 3`, `|vx| ≤ 2`, `|tilt| ≤ 10°`,
`|x| ≤ 15 m`, `fuel ≥ 0`.

No external libraries, no build step, no network calls.

<a href="https://harishkotra.me">Built By Harish Kotra</a> · <a href="https://dailybuild.xyz">Checkout my other builds</a>
