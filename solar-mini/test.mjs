// ============================================================================
// Lunar Descent - test.mjs
// Headless. Runs the deterministic autopilot in Node and prints the verdict,
// the final numbers, and the trajectory JSON to stdout.
// Run: node test.mjs
// ============================================================================

import { run } from './sim.mjs';

const r = run();

console.log('=========================================');
console.log('    LUNAR DESCENT  |  AUTOPILOT TEST');
console.log('=========================================');
console.log('');

console.log('VERDICT: ' + r.verdict);
console.log('');
console.log('--- Final numbers (touchdown) ---');
const s = r.finalState;
console.log('vy   = ' + s.vy.toFixed(2) + ' m/s   (limit |vy| <= 3.0)');
console.log('vx   = ' + s.vx.toFixed(2) + ' m/s   (limit |vx| <= 2.0)');
console.log('tilt = ' + s.theta.toFixed(2) + ' deg   (limit |theta| <= 10)');
console.log('x    = ' + s.x.toFixed(2) + ' m     (limit |x| <= 15)');
console.log('fuel = ' + s.fuel.toFixed(2) + ' kg');
console.log('sim time = ' + r.simTime.toFixed(3) + ' s');
console.log('fuel used = ' + r.fuelUsed.toFixed(2) + ' kg');
console.log('--- Verdict reasons ---');
if (r.reasons.length === 0) {
  console.log('(none - all win conditions hold)');
} else {
  r.reasons.forEach((reason) => console.log(reason));
}
console.log('--- Trajectory JSON (every 6th step, ' + r.trajectory.length + ' points) ---');
console.log(JSON.stringify(r.trajectory));
console.log('--- End trajectory JSON ---');
