// test.mjs — headless verification of the Lunar Descent autopilot.
// Shares sim.mjs with index.html; physics exists in exactly one place.
// Run: node test.mjs
// Deterministic: two consecutive runs produce byte-identical stdout.

import {
  run, autopilot, START_STATE, LIMITS, DT, GRAVITY, DRY_MASS, MAX_THRUST,
  BURN_RATE, FUEL_START, MAX_ANGULAR_ACCEL, MAX_ANGULAR_RATE,
} from './sim.mjs';

const res = run({ controller: autopilot, state: { ...START_STATE } });
const { verdict, touchdown, final, time, steps, trajectory } = res;

const line = '='.repeat(64);
console.log(line);
console.log('LUNAR DESCENT — HEADLESS AUTOPILOT TEST');
console.log(line);
console.log(`VERDICT: ${verdict.banner}`);
if (verdict.reason) console.log(`REASON : ${verdict.reason}`);
console.log(line);
console.log('Touchdown numbers:');
console.log(`  vy       = ${touchdown.vy.toFixed(3)} m/s   (limit |vy| <= ${LIMITS.vy})`);
console.log(`  vx       = ${touchdown.vx.toFixed(3)} m/s   (limit |vx| <= ${LIMITS.vx})`);
console.log(`  tilt     = ${touchdown.theta.toFixed(3)} deg  (limit |theta| <= ${LIMITS.theta})`);
console.log(`  x offset = ${touchdown.x.toFixed(3)} m    (limit |x| <= ${LIMITS.x})`);
console.log(`  fuel     = ${touchdown.fuel.toFixed(2)} kg   (start ${FUEL_START}, must be >= 0)`);
console.log(line);
console.log(`sim time  = ${time.toFixed(2)} s   (limit 300 s)  steps = ${steps}  DT = ${DT.toFixed(6)} s`);
console.log('final state  =', JSON.stringify(final));
console.log('physics used =', JSON.stringify({
  GRAVITY, DRY_MASS, MAX_THRUST, BURN_RATE, FUEL_START,
  MAX_ANGULAR_ACCEL, MAX_ANGULAR_RATE, DT,
}));
console.log(line);
console.log('TRAJECTORY_JSON:');
console.log(JSON.stringify(trajectory));
console.log(line);

process.exitCode = verdict.landed ? 0 : 1;
