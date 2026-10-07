// sim.mjs - Pure physics + autopilot for Lunar Descent

export const GRAVITY = 1.62;          // m/s^2 (downward)
export const DRY_MASS = 500;          // kg
export const MAX_THRUST = 3000;       // N (main engine, body-up axis)
export const BURN_RATE = 8;           // kg/s (at throttle = 1.0)
export const FUEL_START = 250;        // kg
export const MAX_ANGULAR_ACCEL = 90;  // deg/s^2 (RCS torque)
export const MAX_ANGULAR_RATE = 45;   // deg/s
export const DT = 1 / 60;             // s (fixed timestep)

export const START_STATE = {
  x: 0,
  y: 100,
  vx: 5,
  vy: -10,
  theta: 0,
  omega: 0,
  fuel: FUEL_START
};

export const LIMITS = {
  vy: 3.0,
  vx: 2.0,
  theta: 10.0,
  x: 15.0
};

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function createInitialState() {
  return { ...START_STATE };
}

/**
 * Single step of the physics simulation.
 * @param {Object} state - {x, y, vx, vy, theta, omega, fuel}
 * @param {Object} control - {throttle, torque}
 * @returns {Object} new state
 */
export function step(state, control) {
  let throttle = clamp(control.throttle ?? 0, 0, 1);
  const torque = clamp(control.torque ?? 0, -1, 1);

  if (state.fuel <= 0) {
    throttle = 0;
  }

  const mass = DRY_MASS + state.fuel;
  // theta in degrees: 0 = upright, positive tilts nose right.
  // thrust_dir = (sin(theta), cos(theta)) with theta in radians
  const thetaRad = (state.theta * Math.PI) / 180;
  const sinT = Math.sin(thetaRad);
  const cosT = Math.cos(thetaRad);

  const thrustMag = throttle * MAX_THRUST;
  const Fx = thrustMag * sinT;
  const Fy = thrustMag * cosT;

  const ax = Fx / mass;
  const ay = Fy / mass - GRAVITY;

  let vx = state.vx + ax * DT;
  let vy = state.vy + ay * DT;
  let x = state.x + vx * DT;
  let y = state.y + vy * DT;

  let fuel = state.fuel - throttle * BURN_RATE * DT;
  if (fuel <= 0) {
    fuel = 0;
  }

  let omega = clamp(
    state.omega + torque * MAX_ANGULAR_ACCEL * DT,
    -MAX_ANGULAR_RATE,
    MAX_ANGULAR_RATE
  );
  let theta = state.theta + omega * DT;

  return { x, y, vx, vy, theta, omega, fuel };
}

/**
 * Checks touchdown / ground condition.
 * @param {Object} state
 * @returns {{ landed: boolean, crashed: boolean, reasons: string[] }}
 */
export function evaluateTouchdown(state) {
  if (state.y > 0) {
    return { finished: false, landed: false, crashed: false, reasons: [] };
  }

  const reasons = [];
  if (Math.abs(state.vy) > LIMITS.vy) {
    reasons.push(`TOO FAST DESCENT: vy = ${Math.abs(state.vy).toFixed(2)} m/s (limit ${LIMITS.vy.toFixed(1)})`);
  }
  if (Math.abs(state.vx) > LIMITS.vx) {
    reasons.push(`TOO FAST LATERAL: vx = ${Math.abs(state.vx).toFixed(2)} m/s (limit ${LIMITS.vx.toFixed(1)})`);
  }
  if (Math.abs(state.theta) > LIMITS.theta) {
    reasons.push(`EXCESSIVE TILT: theta = ${Math.abs(state.theta).toFixed(2)}° (limit ${LIMITS.theta.toFixed(1)}°)`);
  }
  if (Math.abs(state.x) > LIMITS.x) {
    reasons.push(`OFF PAD TARGET: x offset = ${Math.abs(state.x).toFixed(2)} m (limit ${LIMITS.x.toFixed(1)})`);
  }
  if (state.fuel < 0) {
    reasons.push(`OUT OF FUEL: fuel = ${state.fuel.toFixed(2)} kg`);
  }

  const crashed = reasons.length > 0;
  return {
    finished: true,
    landed: !crashed,
    crashed,
    reasons
  };
}

/**
 * Deterministic autopilot controller.
 *
 * STRATEGY:
 * 1. Horizontal guidance: Target desired vx proportional to lateral displacement (-x),
 *    and request tilt angle thetaCmd via PD attitude control to cancel lateral drift.
 * 2. Vertical guidance: Near touchdown or at low altitude, target a safe descent profile
 *    (descent speed scaling with altitude down to ~1.2 m/s), using throttle to counter gravity.
 * 3. Final touchdown gate: When close to ground (y < 4m), aggressively null out tilt to 0°
 *    and settle vertical velocity vy to -1.5 m/s for a gentle landing within pad boundaries.
 *
 * @param {Object} state - current state
 * @param {number} t - current sim time in seconds
 * @returns {{ throttle: number, torque: number }}
 */
export function autopilot(state, t) {
  const { x, y, vx, vy, theta, omega, fuel } = state;
  if (fuel <= 0) {
    return { throttle: 0, torque: 0 };
  }

  // --- Horizontal & Attitude Guidance ---
  // Target horizontal velocity brings x towards 0
  let targetVx = clamp(-x * 0.75, -2.5, 2.5);
  if (y < 15.0) {
    targetVx = clamp(-x * 0.5, -1.0, 1.0);
  }
  let vxError = vx - targetVx;

  // Commanded tilt:
  let targetTheta = 0;
  if (y > 7.0) {
    targetTheta = clamp(-vxError * 8.5, -20, 20);
  } else if (y > 2.0) {
    // Zero out residual horizontal drift with mild tilt
    targetTheta = clamp(-vx * 4.5, -5.0, 5.0);
  } else {
    // Terminal contact gate: strictly vertical
    targetTheta = 0;
  }

  // PD Attitude control
  const thetaError = targetTheta - theta;
  const desiredOmega = clamp(thetaError * 4.5, -MAX_ANGULAR_RATE, MAX_ANGULAR_RATE);
  const omegaError = desiredOmega - omega;
  let torque = clamp(omegaError * 0.3, -1, 1);

  // --- Vertical Guidance ---
  // Target vertical velocity descent profile:
  // For altitude y, safe vy target:
  let targetVy;
  if (y > 45) {
    targetVy = -8.0;
  } else if (y > 15) {
    targetVy = -1.0 - (y / 45) * 7.0; // linearly ramp from -8 to -3.3
  } else if (y > 4) {
    targetVy = -1.8;
  } else {
    targetVy = -1.2; // soft touchdown target
  }

  // Vertical thrust computation
  // Current effective mass
  const mass = DRY_MASS + fuel;
  // Upward acceleration needed: a_y_des = (targetVy - vy) * Kp
  const vyError = targetVy - vy; // positive if we are falling faster than target
  const kpVy = 1.4;
  const desiredAy = vyError * kpVy;

  // ay = (throttle * MAX_THRUST * cos(theta)) / mass - GRAVITY
  // throttle * MAX_THRUST * cos(theta) = mass * (desiredAy + GRAVITY)
  const thetaRad = (theta * Math.PI) / 180;
  const cosT = Math.max(0.2, Math.cos(thetaRad));
  const hoverThrust = (mass * GRAVITY) / cosT;
  const requiredThrust = (mass * (GRAVITY + desiredAy)) / cosT;

  let throttle = clamp(requiredThrust / MAX_THRUST, 0, 1);

  // If tilt is extreme (> 28 deg), cut throttle slightly to avoid runaway horizontal translation
  if (Math.abs(theta) > 28) {
    throttle = clamp(throttle, 0, 0.4);
  }

  return { throttle, torque };
}

/**
 * Headless simulation runner.
 * Runs until touchdown (y <= 0) or timeout (300s).
 * @param {Function} [controller=autopilot]
 * @returns {Object} result with history, verdict, finalState, steps, time
 */
export function run(controller = autopilot) {
  let state = createInitialState();
  let t = 0;
  let stepIndex = 0;
  const trajectory = [];

  // Record initial trajectory sample (step 0)
  trajectory.push({
    t: Number(t.toFixed(4)),
    x: Number(state.x.toFixed(4)),
    y: Number(state.y.toFixed(4)),
    vx: Number(state.vx.toFixed(4)),
    vy: Number(state.vy.toFixed(4)),
    theta: Number(state.theta.toFixed(4)),
    fuel: Number(state.fuel.toFixed(4)),
    throttle: 0
  });

  let verdict = { finished: false, landed: false, crashed: false, reasons: [] };

  while (t < 300) {
    const ctrl = controller(state, t);
    state = step(state, ctrl);
    stepIndex++;
    t = stepIndex * DT;

    // Record every 6th step (10 Hz equivalent at 60 FPS)
    if (stepIndex % 6 === 0) {
      trajectory.push({
        t: Number(t.toFixed(4)),
        x: Number(state.x.toFixed(4)),
        y: Number(state.y.toFixed(4)),
        vx: Number(state.vx.toFixed(4)),
        vy: Number(state.vy.toFixed(4)),
        theta: Number(state.theta.toFixed(4)),
        fuel: Number(state.fuel.toFixed(4)),
        throttle: Number(clamp(ctrl.throttle ?? 0, 0, 1).toFixed(4))
      });
    }

    verdict = evaluateTouchdown(state);
    if (verdict.finished) {
      break;
    }
  }

  if (!verdict.finished) {
    verdict = {
      finished: true,
      landed: false,
      crashed: true,
      reasons: ['TIMED OUT: Did not touch down within 300 s']
    };
  }

  // Ensure last sample is recorded
  const lastSample = trajectory[trajectory.length - 1];
  if (lastSample.t !== Number(t.toFixed(4))) {
    trajectory.push({
      t: Number(t.toFixed(4)),
      x: Number(state.x.toFixed(4)),
      y: Number(state.y.toFixed(4)),
      vx: Number(state.vx.toFixed(4)),
      vy: Number(state.vy.toFixed(4)),
      theta: Number(state.theta.toFixed(4)),
      fuel: Number(state.fuel.toFixed(4)),
      throttle: 0
    });
  }

  return {
    state,
    t: Number(t.toFixed(4)),
    steps: stepIndex,
    verdict,
    trajectory
  };
}
