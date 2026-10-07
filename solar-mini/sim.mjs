// ============================================================================
// Lunar Descent - sim.mjs
// Pure physics + deterministic autopilot. No DOM, no canvas, no globals.
// All physics lives here exactly once. index.html and test.mjs import this.
// ============================================================================

// ---- FIXED PHYSICS CONSTANTS (never tune) ----

export const GRAVITY = 1.62;             // m/s^2 downward
export const DRY_MASS = 500;             // kg
export const MAX_THRUST = 3000;          // N  (main engine, along body-up axis)
export const BURN_RATE = 8;              // kg/s at throttle = 1.0
export const FUEL_START = 250;           // kg
export const MAX_ANGULAR_ACCEL = 90;     // deg/s^2  (RCS torque)
export const MAX_ANGULAR_RATE = 45;      // deg/s
export const DT = 1 / 60;                // s   (fixed timestep)

// Degrees per pixel reference used only for drawing; NOT part of physics.
export const DEG_PER_PX = 0.25;

// Start state (same for everyone)
export const START_STATE = {
  x: 0,          // m   (horizontal, + to the right)
  y: 100,        // m   (altitude, up positive)
  vx: 5,         // m/s
  vy: -10,       // m/s
  theta: 0,      // deg, 0 = upright, + tilts nose to the right
  omega: 0,      // deg/s
  fuel: FUEL_START, // kg
};

// ---- helpers ----

function toRad(deg) {
  return deg * Math.PI / 180;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- ONE PHYSICS STEP ----

// Controls: throttle in [0,1], torque in [-1,1].
// Integration follows the fixed spec exactly.
export function step(state, controls) {
  // If the engine was cut off by empty fuel, no thrust this step.
  const throttle = state.fuel > 0 ? clamp(controls.throttle, 0, 1) : 0;
  const torque = clamp(controls.torque, -1, 1);

  const { x, y, vx, vy, theta, omega, fuel } = state;
  const mass = DRY_MASS + fuel;

  // thrust_dir = (sin(theta), cos(theta)); theta in radians
  const thDirX = Math.sin(toRad(theta));
  const thDirY = Math.cos(toRad(theta));

  const F = throttle * MAX_THRUST;
  const ax = (F * thDirX) / mass;
  const ay = (F * thDirY) / mass - GRAVITY;

  const nvx = vx + ax * DT;
  const nvy = vy + ay * DT;
  const nx = x + nvx * DT;
  const ny = y + nvy * DT;

  let nf = fuel - throttle * BURN_RATE * DT;
  if (nf <= 0) nf = 0; // engine cut off by empty fuel

  // Rotation (after fuel in the spec)
  let nomega = omega + torque * MAX_ANGULAR_ACCEL * DT;
  nomega = clamp(nomega, -MAX_ANGULAR_RATE, MAX_ANGULAR_RATE);
  const ntheta = theta + nomega * DT;

  return {
    x: nx,
    y: ny,
    vx: nvx,
    vy: nvy,
    theta: ntheta,
    omega: nomega,
    fuel: nf,
    // internal hint: was the engine cut off by empty fuel? (no physics effect)
    engineOff: nf <= 0,
  };
}

// ---- WIN / VERDICT ----

// All conditions must hold at touchdown (y <= 0).
export function checkWin(state) {
  const { vy, vx, theta, x, fuel } = state;
  const ok = Math.abs(vy) <= 3 && Math.abs(vx) <= 2 && Math.abs(theta) <= 10 && Math.abs(x) <= 15 && fuel >= 0;
  const reasons = [];
  if (Math.abs(vy) > 3) reasons.push('TOO FAST VERTICAL: vy = ' + Number(vy.toFixed(2)) + ' m/s (limit 3.0)');
  if (Math.abs(vx) > 2) reasons.push('TOO FAST HORIZONTAL: vx = ' + Number(vx.toFixed(2)) + ' m/s (limit 2.0)');
  if (Math.abs(theta) > 10) reasons.push('TOO TILTED: theta = ' + Number(theta.toFixed(2)) + ' deg (limit 10)');
  if (Math.abs(x) > 15) reasons.push('OFF SIDE: x = ' + Number(x.toFixed(2)) + ' m (limit 15)');
  if (fuel < 0) reasons.push('OUT OF FUEL: ' + Number(fuel.toFixed(2)) + ' kg');
  if (reasons.length) {
    return { won: false, reasons };
  }
  return { won: true, reasons };
}

// ---- DETERMINISTIC AUTOPILOT ----

// Control law (plain words):
//   1) Choose a tilt from horizontal error (lean into the forward drift, more
//      the farther/longer we drift) and use torque to rotate the ship there,
//      holding the tilt until it is time to level out.
//   2) Choose throttle from a vertical PD on altitude and vertical velocity,
//      saturated by thrust limits and corrected for the cosine drop when tilted.
//   3) Within reach of the pad, level the ship and switch to a gentle hover so
//      it eases onto the pad at near-zero vertical speed.
// Strategy: brake the forward drift early with a lean, descend via gravity
// assistance, then level and settle onto the pad under throttle control.

const KRT = 30;       // rotation P (track desired tilt)
const KRO = 2.0;      // rotation D (damp omega)
const MAX_TILT = 22;  // deg - max descent tilt; relieved at touchdown

// Vertical PD gains: (KPY, KVD) make the descent fast then soft.
const KPY = 0.30;
const KVD = 1.8;

// When altitude drops below this, level out and settle onto the pad.
const SETTLE_ALT = 9;

export function autopilot(state) {
  const { x, y, vx, vy, theta, omega, fuel } = state;
  const mass = DRY_MASS + fuel;

  // --- 1) Desired tilt from horizontal error ---
  const aX = -0.18 * x - 2.2 * vx;             // desired horizontal accel (+ to the right)
  const estThrottle = 0.55;                    // map accel -> tilt
  const sinThetaDes = clamp((aX * mass) / (MAX_THRUST * estThrottle), -1, 1);
  let thetaDes = Math.asin(sinThetaDes) * (180 / Math.PI);
  thetaDes = clamp(thetaDes, -MAX_TILT, MAX_TILT); // hold the tilt in bounds

  // --- 2) Torque: PD to track desired tilt and kill rotation.
  // error = (current - desired), so a positive error (nose right of setpoint)
  // produces a negative torque (nose left), correctly driving theta back down.
  const rotErr = theta - thetaDes;
  const torque = clamp(-KRT * rotErr - KRO * omega, -1, 1);

  // --- 3) Throttle: vertical PD, saturated ---
  let aY = -KPY * y - KVD * vy;                // desired vertical accel
  const maxUp = MAX_THRUST / mass - GRAVITY;   // full thrust, upright
  const minDown = -GRAVITY;                    // free fall
  aY = clamp(aY, minDown, maxUp);

  const cosTheta = Math.cos(toRad(thetaDes));
  const cosSafe = cosTheta < 0.01 ? 0.01 : cosTheta;
  let throttle = clamp((aY + GRAVITY) / (MAX_THRUST / mass) / cosSafe, 0, 1);

  // --- 4) Settle onto the pad when close (level + gentle descend) ---
  if (y <= SETTLE_ALT) {
    // Desired vertical accel: descend gently, then brake to near-zero vy.
    let aYSettle = -KPY * y - KVD * (vy + 0.8);
    aYSettle = clamp(aYSettle, minDown, maxUp);
    throttle = clamp((aYSettle + GRAVITY) / (MAX_THRUST / mass) / cosSafe, 0, 1);
  }

  return { throttle: clamp(throttle, 0, 1), torque };
}

// ---- RUN THE AUTOPILOT ----

// Deterministic: no Math.random, no Date.now, no wall-clock. Same input ->
// identical output every run. Sim-time only (DT is fixed).
// Runs from the fixed start state with the autopilot, up to 300 s of sim time.
// Returns: verdict, final state, verdict reasons, trajectory (every 6th step),
//          full trajectory (every step), sim time, fuel used, throttle stats.
export function run(maxSimTime = 300) {
  let state = { ...START_STATE };
  const maxSteps = Math.ceil((maxSimTime / DT) + 1);
  const fullTrajectory = [];
  const trajectory = []; // every 6th step, as required

  let landed = false;
  let verdict = 'CRASHED';
  let reasons = [];
  let simTime = 0;

  for (let i = 0; i < maxSteps; i++) {
    const t = i * DT;
    const controls = autopilot(state);
    fullTrajectory.push({ x: state.x, y: state.y, vx: state.vx, vy: state.vy, theta: state.theta, omega: state.omega, fuel: state.fuel, t, throttle: Number((state.engineOff ? 0 : controls.throttle).toFixed(3)) });

    state = step(state, controls);

    if (i % 6 === 0) {
      trajectory.push({
        t: Number((i * DT).toFixed(3)),
        x: Number(state.x.toFixed(3)),
        y: Number(state.y.toFixed(3)),
        vx: Number(state.vx.toFixed(3)),
        vy: Number(state.vy.toFixed(3)),
        theta: Number(state.theta.toFixed(3)),
        fuel: Number(state.fuel.toFixed(3)),
        throttle: Number((state.engineOff ? 0 : controls.throttle).toFixed(3)),
      });
    }

    simTime = (i + 1) * DT;

    if (state.y <= 0) {
      landed = true;
      const win = checkWin(state);
      if (win.won) {
        verdict = 'LANDED';
        reasons = [];
      } else {
        verdict = 'CRASHED';
        reasons = win.reasons;
      }
      break;
    }
  }

  if (!landed) {
    const win = checkWin(state);
    if (win.won) {
      verdict = 'LANDED';
      reasons = [];
    } else {
      verdict = 'CRASHED';
      reasons = win.reasons;
    }
  }

  const landedState = { ...state };
  const fuelUsed = START_STATE.fuel - state.fuel;
  const trajectoryThrottles = trajectory.map((p) => p.throttle);
  const throttleStats = {
    min: trajectoryThrottles.length ? Number(Math.min(...trajectoryThrottles).toFixed(3)) : 0,
    max: trajectoryThrottles.length ? Number(Math.max(...trajectoryThrottles).toFixed(3)) : 0,
  };

  return {
    verdict,
    finalState: landedState,
    reasons,
    trajectory,
    fullTrajectory,
    simTime: Number(simTime.toFixed(3)),
    fuelUsed,
    throttleStats,
  };
}
