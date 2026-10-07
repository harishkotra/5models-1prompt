# Lunar Descent

A self-contained, high-fidelity lunar lander physics simulator with both an interactive manual flight mode and a deterministic, provably reproducible autopilot.

## Running the Application

Because this project uses native ECMAScript Modules (`sim.mjs`), browsers will not load it directly from the `file://` protocol due to CORS security policies.

Start an offline local HTTP server from this directory:

```bash
python3 -m http.server 8080
```

Then open your browser to:
[http://localhost:8080](http://localhost:8080)

---

## Headless Node.js Execution

The autopilot and physics simulation can be executed headlessly without any browser or DOM dependencies:

```bash
node test.mjs
```

This outputs the simulation verdict, touchdown metrics, and the trajectory sample array JSON (sampled every 6th physics step).

---

## Fixed Physics Constants

All builds use identical, fixed physics values:

- **GRAVITY**: `1.62 m/s²` (downward)
- **DRY_MASS**: `500 kg`
- **MAX_THRUST**: `3000 N` (main engine, body-up axis)
- **BURN_RATE**: `8 kg/s` (at throttle = 1.0)
- **FUEL_START**: `250 kg`
- **MAX_ANGULAR_ACCEL**: `90 deg/s²` (RCS torque)
- **MAX_ANGULAR_RATE**: `45 deg/s`
- **DT**: `1/60 s` (fixed timestep, never variable)

### Initial Conditions
- `x = 0 m`, `y = 100 m`
- `vx = +5 m/s`, `vy = -10 m/s`
- `theta = 0°`, `omega = 0 deg/s`
- `fuel = 250 kg`

### Touchdown Criteria (at altitude y <= 0)
- `|vy| <= 3.0 m/s`
- `|vx| <= 2.0 m/s`
- `|theta| <= 10.0°`
- `|x| <= 15.0 m`
- `fuel >= 0 kg`

---

## Architecture & Codebase

- [`sim.mjs`](./sim.mjs) : Pure physics engine, numerical integrator, landing evaluator, deterministic autopilot, and simulation runner. No DOM, no external dependencies.
- [`index.html`](./index.html) : Canvas 2D visualization with starfield, lunar surface with craters, landing pad zone, Apollo-style lander with animated flame, real-time HUD telemetry, and flight controls.
- [`test.mjs`](./test.mjs) : Headless CLI runner importing `sim.mjs`.
