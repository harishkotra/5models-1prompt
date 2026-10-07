// sim.mjs — "Lunar Descent": pure physics + deterministic autopilot.
// No DOM, no canvas, no globals, no Math.random, no Date.now.
// This file is the SINGLE source of truth for the physics.
// index.html and test.mjs both import it.

export const GRAVITY = 1.62;          // m/s^2, downward
export const DRY_MASS = 500;          // kg
export const MAX_THRUST = 3000;       // N, main engine, along the body-up axis
export const BURN_RATE = 8;           // kg/s at throttle = 1.0
export const FUEL_START = 250;        // kg
export const MAX_ANGULAR_ACCEL = 90;  // deg/s^2, RCS torque
export const MAX_ANGULAR_RATE = 45;   // deg/s
export const DT = 1 / 60;             // s, fixed timestep, never variable

export const MAX_SIM_TIME = 300;      // s, autopilot must land within this
export const RECORD_EVERY = 6;        // trajectory cadence, in steps

export const LIMITS = Object.freeze({ vy: 3, vx: 2, theta: 10, x: 15 });

export const START_STATE = Object.freeze({
  x: 0, y: 100, vx: 5, vy: -10, theta: 0, omega: 0, fuel: FUEL_START,
});

// All fixed physics values, for the on-screen constants panel.
export const PHYSICS_PANEL = Object.freeze([
  ['GRAVITY', '1.62 m/s^2'],
  ['DRY_MASS', '500 kg'],
  ['MAX_THRUST', '3000 N'],
  ['BURN_RATE', '8 kg/s'],
  ['FUEL_START', '250 kg'],
  ['MAX_ANGULAR_ACCEL', '90 deg/s^2'],
  ['MAX_ANGULAR_RATE', '45 deg/s'],
  ['DT', '1/60 s (fixed)'],
]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function initialState() {
  return { ...START_STATE };
}

// The throttle/torque actually applied to a state: clamped to range, and
// zero when the tank is empty. step() uses exactly this; UIs use it to
// record/display the effective throttle instead of the raw command.
export function effectiveControl(state, control) {
  const throttle = state.fuel <= 0 ? 0 : clamp(control.throttle ?? 0, 0, 1);
  const torque = clamp(control.torque ?? 0, -1, 1);
  return { throttle, torque };
}

// Advance one fixed timestep. Pure: returns a new state, mutates nothing.
// Integration order is exactly the spec:
//   mass = DRY_MASS + fuel
//   thrust_dir = (sin theta, cos theta)
//   F = throttle * MAX_THRUST * thrust_dir
//   a = F / mass + (0, -GRAVITY)
//   v += a * DT ; pos += v * DT            (semi-implicit Euler)
//   fuel -= throttle * BURN_RATE * DT ; if fuel <= 0: fuel = 0, throttle forced to 0
//   omega = clamp(omega + torque * MAX_ANGULAR_ACCEL * DT, +-MAX_ANGULAR_RATE)
//   theta += omega * DT
export function step(state, control) {
  const { throttle, torque } = effectiveControl(state, control);

  const mass = DRY_MASS + state.fuel;
  const rad = (state.theta * Math.PI) / 180;
  const F = throttle * MAX_THRUST;
  const ax = (F * Math.sin(rad)) / mass;
  const ay = (F * Math.cos(rad)) / mass - GRAVITY;

  const vx = state.vx + ax * DT;
  const vy = state.vy + ay * DT;
  const x = state.x + vx * DT;
  const y = state.y + vy * DT;

  let fuel = state.fuel - throttle * BURN_RATE * DT;
  if (fuel <= 0) fuel = 0;

  const omega = clamp(
    state.omega + torque * MAX_ANGULAR_ACCEL * DT,
    -MAX_ANGULAR_RATE, MAX_ANGULAR_RATE,
  );
  const theta = state.theta + omega * DT;

  return { x, y, vx, vy, theta, omega, fuel };
}

// AUTOPILOT (deterministic; only throttle + torque). Law: P-track velocity
// targets vyDes = -clamp(0.30*y, 1.2, 11), vxDes = -0.10*x (horizontal
// authority fades below 25 m so the nose levels for the tilt win check).
// Velocity error -> desired net accel (ax, ay); thrust must also hold weight:
// throttle = mass*|(ax, ay+G)|/MAX_THRUST pointing along (ax, ay+G); tilt PD.
export function autopilot(state) {
  const { x, y, vx, vy, theta, omega, fuel } = state;

  const kp = 0.85;                                    // velocity-tracking gain
  const vyDes = -clamp(0.30 * Math.max(y, 0), 1.2, 11);
  const hGate = clamp(y / 25, 0, 1);                  // go upright below 25 m
  const vxDes = -clamp(0.10 * x, -2.5, 2.5) * hGate;

  const axDes = clamp(kp * (vxDes - vx), -1.6, 1.6) * hGate;
  const ayDes = clamp(kp * (vyDes - vy), -1.0, 3.2);

  const tx = axDes;                 // required thrust accel, horizontal
  const ty = ayDes + GRAVITY;       // required thrust accel, vertical (holds weight)
  const thetaDes = clamp((Math.atan2(tx, ty) * 180) / Math.PI, -32, 32);
  const mass = DRY_MASS + fuel;
  const throttle = clamp((mass * Math.hypot(tx, ty)) / MAX_THRUST, 0, 1);

  const torque = clamp(0.02 * (thetaDes - theta) - 0.018 * omega, -1, 1);
  return { throttle, torque };
}

export function record(t, s, u) {
  const r4 = (v) => Number(v.toFixed(4));
  return {
    t: r4(t), x: r4(s.x), y: r4(s.y), vx: r4(s.vx), vy: r4(s.vy),
    theta: r4(s.theta), fuel: r4(s.fuel), throttle: r4(u.throttle),
  };
}

// Evaluate touchdown against the win condition:
//   |vy| <= 3 m/s, |vx| <= 2 m/s, |theta| <= 10 deg, |x| <= 15 m, fuel >= 0
export function judge(s, landed, time) {
  if (!landed) {
    return {
      banner: 'CRASHED',
      landed: false,
      reason: `TIMEOUT: still airborne at t = ${time.toFixed(1)} s (limit ${MAX_SIM_TIME} s)`,
      violations: ['TIMEOUT'],
    };
  }
  const violations = [];
  if (Math.abs(s.vy) > LIMITS.vy) {
    violations.push(`TOO FAST: vy = ${s.vy.toFixed(2)} m/s (limit ${LIMITS.vy.toFixed(1)})`);
  }
  if (Math.abs(s.vx) > LIMITS.vx) {
    violations.push(`DRIFTING: vx = ${s.vx.toFixed(2)} m/s (limit ${LIMITS.vx.toFixed(1)})`);
  }
  if (Math.abs(s.theta) > LIMITS.theta) {
    violations.push(`TOO STEEP: tilt = ${s.theta.toFixed(2)} deg (limit ${LIMITS.theta})`);
  }
  if (Math.abs(s.x) > LIMITS.x) {
    violations.push(`OFF PAD: x = ${s.x.toFixed(2)} m (limit ${LIMITS.x})`);
  }
  if (s.fuel < 0) {
    violations.push(`OUT OF FUEL: fuel = ${s.fuel.toFixed(2)} kg`);
  }
  return {
    banner: violations.length === 0 ? 'LANDED' : 'CRASHED',
    landed: violations.length === 0,
    reason: violations.length === 0 ? null : violations.join('; '),
    violations,
  };
}

// Run a full simulation with a controller (state, t) -> {throttle, torque}.
// Every `recordEvery`-th step is appended to the trajectory.
export function run({
  controller = autopilot,
  state = initialState(),
  maxTime = MAX_SIM_TIME,
  recordEvery = RECORD_EVERY,
} = {}) {
  let s = { ...state };
  let t = 0;
  let i = 0;
  const trajectory = [];
  trajectory.push(record(t, s, effectiveControl(s, controller(s, t))));
  while (s.y > 0 && t < maxTime - DT / 2) {
    const u = controller(s, t);
    const eff = effectiveControl(s, u);
    s = step(s, u);
    t += DT;
    i += 1;
    if (i % recordEvery === 0) trajectory.push(record(t, s, eff));
  }
  const landed = s.y <= 0;
  const verdict = judge(s, landed, t);
  return {
    trajectory, final: s, time: t, steps: i, landed, verdict,
    touchdown: {
      vy: s.vy, vx: s.vx, theta: s.theta, x: s.x, fuel: s.fuel,
    },
  };
}
