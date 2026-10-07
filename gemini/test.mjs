// test.mjs - Headless test runner for Lunar Descent autopilot

import { run, LIMITS } from './sim.mjs';

const result = run();
const { state, t, verdict, trajectory } = result;

console.log('========================================');
console.log('       LUNAR DESCENT SIMULATION         ');
console.log('========================================\n');

if (verdict.landed) {
  console.log('VERDICT: LANDED');
  console.log('Touchdown successful! Perfect landing within all safety margins.\n');
} else {
  console.log('VERDICT: CRASHED');
  console.log('Failure reasons:');
  for (const r of verdict.reasons) {
    console.log(`  - ${r}`);
  }
  console.log();
}

console.log('FINAL TOUCHDOWN NUMBERS:');
console.log(`  Vertical Velocity (vy) : ${state.vy.toFixed(4)} m/s (Limit: |vy| <= ${LIMITS.vy.toFixed(1)} m/s)`);
console.log(`  Lateral Velocity  (vx) : ${state.vx.toFixed(4)} m/s (Limit: |vx| <= ${LIMITS.vx.toFixed(1)} m/s)`);
console.log(`  Tilt Angle     (theta) : ${state.theta.toFixed(4)} deg (Limit: |theta| <= ${LIMITS.theta.toFixed(1)} deg)`);
console.log(`  Lateral Offset     (x) : ${state.x.toFixed(4)} m   (Limit: |x| <= ${LIMITS.x.toFixed(1)} m)`);
console.log(`  Fuel Remaining         : ${state.fuel.toFixed(4)} kg`);
console.log(`  Touchdown Time         : ${t.toFixed(4)} s`);
console.log(`  Trajectory Sample Count: ${trajectory.length} samples\n`);

console.log('TRAJECTORY JSON:');
console.log(JSON.stringify(trajectory, null, 2));
