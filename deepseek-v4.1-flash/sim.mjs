// sim.mjs — Lunar Descent: pure physics + deterministic autopilot.
// No DOM, no canvas, no globals. Everything the browser and Node share lives here.

// ---------------------------------------------------------------------------
// FIXED PHYSICS CONSTANTS (do not tune)
// ---------------------------------------------------------------------------
export const GRAVITY = 1.62;            // m/s^2, downward
export const DRY_MASS = 500;            // kg
export const MAX_THRUST = 3000;         // N, main engine along body-up axis
export const BURN_RATE = 8;             // kg/s at throttle = 1.0
export const FUEL_START = 250;          // kg
export const MAX_ANGULAR_ACCEL = 90;    // deg/s^2, RCS torque
export const MAX_ANGULAR_RATE = 45;     // deg/s
export const DT = 1 / 60;               // s, fixed timestep, never variable

// Touchdown / win-condition limits.
export const MAX_VY = 3;                // m/s
export const MAX_VX = 2;                // m/s
export const MAX_TILT = 10;             // deg
export const MAX_X = 15;                // m
export const MAX_TIME = 300;            // s of sim time

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function startState() {
  return { x: 0, y: 100, vx: 5, vy: -10, theta: 0, omega: 0, fuel: FUEL_START };
}

// ---------------------------------------------------------------------------
// One integration step. Identical for every build.
//   mass       = DRY_MASS + fuel
//   thrust_dir = (sin(theta), cos(theta))
//   F          = throttle * MAX_THRUST * thrust_dir
//   a          = F / mass + (0, -GRAVITY)
//   v += a*DT ; pos += v*DT
//   fuel -= throttle*BURN_RATE*DT ; if fuel <= 0 -> fuel = 0, throttle = 0
//   omega = clamp(omega + torque*MAX_ANGULAR_ACCEL*DT, +/-MAX_ANGULAR_RATE)
//   theta += omega*DT
// ---------------------------------------------------------------------------
export function step(s, throttle, torque, dt = DT) {
  const mass = DRY_MASS + s.fuel;
  let th = clamp(throttle, 0, 1);
  if (s.fuel <= 0) th = 0; // out of fuel: engine cannot fire

  const thetaRad = s.theta * (Math.PI / 180);
  const Fx = th * MAX_THRUST * Math.sin(thetaRad);
  const Fy = th * MAX_THRUST * Math.cos(thetaRad);
  const ax = Fx / mass;
  const ay = Fy / mass - GRAVITY;

  const vx = s.vx + ax * dt;
  const vy = s.vy + ay * dt;
  const x = s.x + vx * dt;
  const y = s.y + vy * dt;

  let fuel = s.fuel - th * BURN_RATE * dt;
  if (fuel < 0) fuel = 0;

  const omega = clamp(
    s.omega + torque * MAX_ANGULAR_ACCEL * dt,
    -MAX_ANGULAR_RATE,
    MAX_ANGULAR_RATE
  );
  const theta = s.theta + omega * dt;

  return { x, y, vx, vy, theta, omega, fuel };
}

// ---------------------------------------------------------------------------
// AUTOPILOT — deterministic, uses only throttle + torque.
//
// Control law (strategy):
//  1. Vertical: follow a braking profile vy* = -min(sqrt(2*A*y), VY_CAP); a PD
//     on (vy* - vy) gives the vertical acceleration we want.
//  2. Horizontal: a PD on (x, vx) gives a desired horizontal accel, mapped to a
//     clamped tilt (nose opposite the drift) so RCS turns thrust sideways.
//  3. Throttle = the thrust needed to realize that vertical accel along the
//     CURRENT tilt, clamped to [0,1].
//  4. Attitude: a PD on (theta - theta*, omega) -> RCS torque.
//
// No Math.random, no Date.now, no wall-clock. Same numbers every run.
// ---------------------------------------------------------------------------
export function autopilot(s) {
  const A_DECEL = 1.6;     // m/s^2 conservative braking accel for the profile
  const VY_CAP = 6;        // m/s cap on descent speed
  const TILT_MAX = 28;     // deg cap on commanded tilt

  const y = Math.max(s.y, 0);

  // 1) desired vertical speed and the acceleration to reach it
  const vyTarget = -Math.min(Math.sqrt(2 * A_DECEL * y), VY_CAP);
  const ayDes = 3.0 * (vyTarget - s.vy);

  // 2) desired horizontal acceleration -> desired tilt
  const axDes = -(1.3 * s.x + 6.0 * s.vx);
  const thetaDes = clamp(axDes * 2.0, -TILT_MAX, TILT_MAX);

  // 3) throttle from vertical demand along the current tilt
  const mass = DRY_MASS + s.fuel;
  const cosT = Math.cos(s.theta * (Math.PI / 180));
  let throttle = (mass * (ayDes + GRAVITY)) / (MAX_THRUST * cosT);
  throttle = clamp(throttle, 0, 1);

  // 4) attitude PD -> torque
  const eTheta = thetaDes - s.theta;
  const omegaDes = clamp(8.0 * eTheta, -MAX_ANGULAR_RATE, MAX_ANGULAR_RATE);
  const torque = clamp(0.18 * (omegaDes - s.omega), -1, 1);

  return { throttle, torque };
}

// ---------------------------------------------------------------------------
// Evaluate a touchdown state against the win condition.
// ---------------------------------------------------------------------------
export function evaluate(s, t) {
  const vy = s.vy;
  const vx = s.vx;
  const tilt = s.theta;
  const xoff = s.x;

  let reason = null;
  if (Math.abs(vy) > MAX_VY) {
    reason = `TOO FAST: vy = ${vy.toFixed(1)} m/s (limit ${MAX_VY.toFixed(1)})`;
  } else if (Math.abs(vx) > MAX_VX) {
    reason = `TOO FAST SIDEWAYS: vx = ${vx.toFixed(1)} m/s (limit ${MAX_VX.toFixed(1)})`;
  } else if (Math.abs(tilt) > MAX_TILT) {
    reason = `TILTED: ${tilt.toFixed(1)} deg (limit ${MAX_TILT.toFixed(1)})`;
  } else if (Math.abs(xoff) > MAX_X) {
    reason = `MISSED THE PAD: x = ${xoff.toFixed(1)} m (limit ${MAX_X.toFixed(1)})`;
  }

  if (!reason && s.y > 0) {
    reason = `OUT OF TIME: still airborne at ${t.toFixed(1)} s`;
  }

  const touchdown = { vy, vx, tilt, x: xoff, fuel: s.fuel, t };
  return {
    verdict: reason ? 'CRASHED' : 'LANDED',
    reason,
    touchdown,
  };
}

// ---------------------------------------------------------------------------
// Run a full flight. `control` defaults to the autopilot.
// Returns the verdict, final numbers, the exported trajectory (every 6th step)
// and a per-step `samples` array for smooth replay in the browser.
// ---------------------------------------------------------------------------
export function run({ control = autopilot, recordEvery = 6, maxTime = MAX_TIME, dt = DT } = {}) {
  let s = startState();
  const trajectory = [];
  const samples = [];
  let stepCount = 0;
  let t = 0;

  while (true) {
    const c = control(s, t);
    const throttle = clamp(c.throttle, 0, 1);
    const torque = c.torque;

    samples.push({
      t, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
      theta: s.theta, omega: s.omega, fuel: s.fuel,
      throttle, torque,
    });
    if (stepCount % recordEvery === 0) {
      trajectory.push({
        t, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
        theta: s.theta, fuel: s.fuel, throttle,
      });
    }

    s = step(s, throttle, torque, dt);
    stepCount++;
    t = stepCount * dt;

    if (s.y <= 0) break;      // touchdown
    if (t >= maxTime) break;  // timeout
  }

  // final touchdown/timeout sample
  samples.push({
    t, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
    theta: s.theta, omega: s.omega, fuel: s.fuel,
    throttle: 0, torque: 0,
  });
  trajectory.push({
    t, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
    theta: s.theta, fuel: s.fuel, throttle: 0,
  });

  const result = evaluate(s, t);
  return { ...result, steps: stepCount, trajectory, samples, final: s };
}

export default {
  GRAVITY, DRY_MASS, MAX_THRUST, BURN_RATE, FUEL_START,
  MAX_ANGULAR_ACCEL, MAX_ANGULAR_RATE, DT,
  MAX_VY, MAX_VX, MAX_TILT, MAX_X, MAX_TIME,
  clamp, startState, step, autopilot, evaluate, run,
};