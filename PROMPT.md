### PROMPT

Build a self-contained lunar lander simulator called "Lunar Descent".

GOAL
One lander, one pad, real physics. The lander starts high above the pad and must
touch down safely. Ship BOTH a manual mode (keyboard) and a deterministic autopilot that lands with zero human input. The autopilot's result is the whole point: it must be reproducible, and the app must state it plainly.

FILES (write all three into the current directory)
  sim.mjs    - pure physics + autopilot. No DOM, no canvas, no globals. Exports the constants, a step() function, an autopilot() controller, and run().
  index.html - canvas 2D visual + HUD + controls. Imports sim.mjs.
  test.mjs   - headless: runs the autopilot in Node, prints the verdict, the final numbers, and the trajectory JSON to stdout.
index.html and test.mjs MUST share sim.mjs. Do not duplicate the physics anywhere.

PHYSICS (FIXED. Use these exact values. Do not tune, do not "improve" them.)
  GRAVITY            = 1.62 m/s^2   (downward)
  DRY_MASS           = 500 kg
  MAX_THRUST         = 3000 N       (main engine, along the lander's body-up axis)
  BURN_RATE          = 8 kg/s       (at throttle = 1.0)
  FUEL_START         = 250 kg
  MAX_ANGULAR_ACCEL  = 90 deg/s^2   (RCS torque)
  MAX_ANGULAR_RATE   = 45 deg/s
  DT                 = 1/60 s       (fixed timestep, never variable)

STATE: x, y (altitude, up positive), vx, vy, theta (deg, 0 = upright, positive tilts the nose to the right), omega (deg/s), fuel (kg).
CONTROLS EACH STEP: throttle in [0,1], torque in [-1,1].

INTEGRATION (identical for every build)
  mass       = DRY_MASS + fuel
  thrust_dir = (sin(theta), cos(theta))          # theta in radians
  F          = (throttle * MAX_THRUST) * thrust_dir
  a          = F / mass + (0, -GRAVITY)
  v         += a * DT
  pos       += v * DT
  fuel      -= throttle * BURN_RATE * DT
  if fuel <= 0: fuel = 0, throttle forced to 0
  omega      = clamp(omega + torque * MAX_ANGULAR_ACCEL * DT, -MAX_ANGULAR_RATE, +MAX_ANGULAR_RATE)
  theta     += omega * DT

START STATE (same for everyone)
x = 0, y = 100, vx = +5, vy = -10, theta = 0, omega = 0, fuel = 250

WIN CONDITION (all must hold at touchdown, y <= 0)
|vy| <= 3 m/s   |vx| <= 2 m/s   |theta| <= 10 deg   |x| <= 15 m   fuel >= 0
Landing anywhere outside those limits is a CRASH. Crashing is a valid, expected result.

AUTOPILOT (required)
- Deterministic. No Math.random, no Date.now, no wall-clock. Same result every run.
- Uses only throttle and torque. No cheats, no teleporting, no editing state directly.
- Must land from the fixed start state within 300 s of sim time.
- Comment the control law in 3-5 lines so the viewer can see the strategy.

MANUAL MODE (required)
Arrow keys / WASD: up = throttle up, left/right = torque. Space = full throttle.

VERDICT (required, both in the app and in test.mjs)
Print a big banner: LANDED or CRASHED, plus the four touchdown numbers (vy, vx, tilt, x offset) and fuel remaining. On a crash, name the reason in plain words, e.g. "TOO FAST: vy = 7.2 m/s (limit 3.0)".

TRAJECTORY EXPORT (required)
Every 6th step, record {t, x, y, vx, vy, theta, fuel, throttle}. index.html gets a "COPY TRAJECTORY JSON" button that copies that array. test.mjs prints the same array to stdout.

VISUAL SPEC (canvas 2D, no libraries, no three.js)

Dark starfield, a grey lunar surface, one flat landing pad with a marked target zone, a lander drawn as a body + legs + a flame whose length scales with throttle. Camera follows the lander but clamps at the ground. Trajectory trail drawn as a faint line.

HUD (required)
Altitude, vx, vy, tilt, fuel, throttle. Plus a small constants panel showing the FIXED physics values, so anyone can confirm all builds used identical physics.

UI REQUIREMENTS
Two buttons: "RUN AUTOPILOT" (instant, gives the verdict immediately) and "REPLAY SLOW" (same run, real time, for filming). Loading and error states are not needed here; there is no network call.

NON-GOALS
No LLM calls, no API keys, no settings panel, no backend, no database, no auth, no deploy config, no npm dependencies, no CDN, no build step. This app has no runtime model dependency: the physics and the autopilot are the entire product.

ACCEPTANCE CRITERIA (verify each, then report)
1. Runs offline by python3 -m http.server 8080 then opening http://localhost:8080. (ES modules will not load from file://; state that in the README.)
2. Uses the FIXED constants above, printed on screen.
3. Autopilot is deterministic: two runs give byte-identical verdicts and trajectories.
4. node test.mjs prints VERDICT + final numbers + trajectory JSON with no browser.
5. index.html and test.mjs share sim.mjs; physics exists in exactly one place.
6. Footer contains, verbatim: "Built By Harish Kotra" linking to https://harishkotra.me and "Checkout my other builds" linking to https://dailybuild.xyz
7. No three.js, no external libraries.
8. You actually ran node test.mjs. Paste its verdict in your final message.
