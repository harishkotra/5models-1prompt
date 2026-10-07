// sim.mjs — "Lunar Descent": pure physics + deterministic autopilot.
// No DOM, no canvas, no globals, no Math.random, no Date.now.
// This file is the SINGLE source of truth for physics:
// index.html (browser) and test.mjs (Node) both import it.

export const CONST = Object.freeze({
  GRAVITY: 1.62,          // m/s^2, downward
  DRY_MASS: 500,          // kg
  MAX_THRUST: 3000,       // N, main engine along the body-up axis
  BURN_RATE: 8,           // kg/s at throttle = 1.0
  FUEL_START: 250,        // kg
  MAX_ANGULAR_ACCEL: 90,  // deg/s^2, RCS torque at command = 1
  MAX_ANGULAR_RATE: 45,   // deg/s
  DT: 1 / 60,             // s, fixed timestep (never variable)
});

export const START = Object.freeze({
  x: 0, y: 100, vx: 5, vy: -10, theta: 0, omega: 0, fuel: 250,
});

export const LIMITS = Object.freeze({
  VY: 3,      // m/s
  VX: 2,      // m/s
  THETA: 10,  // deg
  X: 15,      // m
  TIME: 300,  // s, autopilot must land within this
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;

// One fixed-timestep integration step. Matches the spec exactly:
//   v += a*DT; pos += v*DT; fuel -= burn; omega clamped; theta += omega*DT.
export function step(s, throttleIn, torqueIn) {
  let throttle = clamp(throttleIn, 0, 1);
  if (s.fuel <= 0) throttle = 0; // out of fuel -> engine dead
  const mass = CONST.DRY_MASS + s.fuel;
  const th = s.theta * DEG; // theta in deg, 0 = upright, +tilts nose right
  const ax = (throttle * CONST.MAX_THRUST * Math.sin(th)) / mass;
  const ay = (throttle * CONST.MAX_THRUST * Math.cos(th)) / mass - CONST.GRAVITY;
  const vx = s.vx + ax * CONST.DT;
  const vy = s.vy + ay * CONST.DT;
  const x = s.x + vx * CONST.DT;
  const y = s.y + vy * CONST.DT;
  let fuel = s.fuel - throttle * CONST.BURN_RATE * CONST.DT;
  if (fuel <= 0) fuel = 0;
  const omega = clamp(
    s.omega + clamp(torqueIn, -1, 1) * CONST.MAX_ANGULAR_ACCEL * CONST.DT,
    -CONST.MAX_ANGULAR_RATE, CONST.MAX_ANGULAR_RATE
  );
  const theta = s.theta + omega * CONST.DT;
  return { x, y, vx, vy, theta, omega, fuel };
}

// AUTOPILOT — deterministic, pure function of state.
//
// Control law:
//   Vertical: command a sink rate vy_cmd = -sqrt(2*A_DEC*alt), a constant-
//   deceleration descent profile (floored at 0.6 m/s so touchdown actually
//   happens instead of asymptotic hovering). The up-acceleration demand is
//   a_up = KV * (vy_cmd - vy), so the vertical thrust force is m*(a_up + g).
//   Horizontal: a_side = -KX*vx - KPX*x kills drift and recenters on the pad.
//   Both demands form a thrust vector F = (m*a_side, m*(a_up+g)); the law
//   sets tilt = atan2(Fx, Fy) and throttle = |F|/MAX_THRUST — exactly the
//   vector physics needs. An inner critically-damped PD loop (torque output)
//   steers the body to that tilt.
const A_DEC = 0.55;   // m/s^2 deceleration budget of the descent profile
const KV = 1.5;       // 1/s vertical velocity tracking gain
const KX = 0.9;       // 1/s horizontal velocity gain
const KPX = 0.25;     // 1/s^2 horizontal position gain
const A_SIDE_MAX = 2.5; // m/s^2 lateral accel demand cap

export function autopilot(s) {
  const mass = CONST.DRY_MASS + s.fuel;
  const sink = Math.sqrt(2 * A_DEC * Math.max(s.y, 0));
  const vyCmd = -clamp(Math.max(sink, 0.6), 0.6, 20);
  const aUp = clamp(KV * (vyCmd - s.vy), -6, 8);
  const aSide = clamp(-KX * s.vx - KPX * s.x, -A_SIDE_MAX, A_SIDE_MAX);
  const Fx = mass * aSide;
  const Fy = Math.max(mass * (aUp + CONST.GRAVITY), 0);
  let throttle, thetaCmd;
  if (Fy <= 1e-9) {
    // Free-fall phase: no vertical thrust wanted; pre-tilt for the burn.
    throttle = 0;
    thetaCmd = clamp(aSide * 15, -50, 50);
  } else {
    throttle = clamp(Math.hypot(Fx, Fy) / CONST.MAX_THRUST, 0, 1);
    thetaCmd = clamp(Math.atan2(Fx, Fy) / DEG, -50, 50);
  }
  // Inner attitude loop: PD, critically damped, torque in [-1, 1].
  const torque = clamp(
    (30 * (thetaCmd - s.theta) - 11 * s.omega) / CONST.MAX_ANGULAR_ACCEL,
    -1, 1
  );
  return { throttle, torque };
}

// Verdict against the win condition at touchdown (y <= 0).
const fmt = (v, d = 2) => v.toFixed(d);
export function judge(s, timedOut = false) {
  const numbers = {
    vy: `vy = ${fmt(s.vy)} m/s (limit ±3.0)`,
    vx: `vx = ${fmt(s.vx)} m/s (limit ±2.0)`,
    tilt: `tilt = ${fmt(s.theta)} deg (limit ±10)`,
    x: `x offset = ${fmt(s.x)} m (limit ±15)`,
    fuel: `fuel = ${fmt(s.fuel)} kg`,
  };
  if (timedOut) {
    return { landed: false, reason: `TIMEOUT: still airborne at t = ${LIMITS.TIME} s`, numbers };
  }
  let reason = null;
  if (Math.abs(s.vy) > LIMITS.VY)         reason = `TOO FAST: vy = ${fmt(s.vy)} m/s (limit 3.0)`;
  else if (Math.abs(s.vx) > LIMITS.VX)    reason = `TOO FAST SIDEWAYS: vx = ${fmt(s.vx)} m/s (limit 2.0)`;
  else if (Math.abs(s.theta) > LIMITS.THETA) reason = `TIPPED OVER: tilt = ${fmt(s.theta)} deg (limit 10)`;
  else if (Math.abs(s.x) > LIMITS.X)      reason = `MISSED THE PAD: x offset = ${fmt(s.x)} m (limit 15)`;
  return { landed: reason === null, reason, numbers };
}

// Full headless flight from the fixed start state. Deterministic.
// Records a trajectory frame every 6th step.
export function run(controller = autopilot, maxTime = LIMITS.TIME) {
  let s = { ...START };
  const frames = [];
  const maxSteps = Math.round(maxTime / CONST.DT);
  let throttle = 0;
  let n = 0;
  for (; n < maxSteps && s.y > 0; n++) {
    const c = controller(s);
    throttle = c.throttle;
    s = step(s, c.throttle, c.torque);
    if ((n + 1) % 6 === 0) {
      frames.push({
        t: +((n + 1) * CONST.DT).toFixed(6),
        x: s.x, y: s.y, vx: s.vx, vy: s.vy,
        theta: s.theta, fuel: s.fuel, throttle,
      });
    }
  }
  const timedOut = s.y > 0;
  return { final: s, frames, steps: n, t: n * CONST.DT, verdict: judge(s, timedOut) };
}
