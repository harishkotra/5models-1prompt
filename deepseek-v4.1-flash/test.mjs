// test.mjs — headless acceptance run for Lunar Descent.
// Runs the deterministic autopilot in Node, prints the verdict, the final
// numbers, and the trajectory JSON to stdout. No browser required.
//
//   node test.mjs

import { run, GRAVITY, DRY_MASS, MAX_THRUST, BURN_RATE, FUEL_START,
         MAX_ANGULAR_ACCEL, MAX_ANGULAR_RATE, DT,
         MAX_VY, MAX_VX, MAX_TILT, MAX_X, MAX_TIME } from './sim.mjs';

const r = run();

const line = '='.repeat(64);
console.log(line);
console.log(`  ${r.verdict === 'LANDED' ? '*** LANDED ***' : '*** CRASHED ***'}`);
console.log(line);

console.log('\nTOUCHDOWN NUMBERS');
const td = r.touchdown;
console.log(`  vy (vertical)   : ${td.vy.toFixed(2)} m/s   (limit ${MAX_VY.toFixed(1)})`);
console.log(`  vx (horizontal) : ${td.vx.toFixed(2)} m/s   (limit ${MAX_VX.toFixed(1)})`);
console.log(`  tilt            : ${td.tilt.toFixed(2)} deg  (limit ${MAX_TILT.toFixed(1)})`);
console.log(`  x offset        : ${td.x.toFixed(2)} m     (limit ${MAX_X.toFixed(1)})`);
console.log(`  fuel remaining  : ${td.fuel.toFixed(2)} kg of ${FUEL_START} kg`);
console.log(`  flight time     : ${td.t.toFixed(2)} s`);
console.log(`  steps           : ${r.steps}`);

if (r.reason) console.log(`\nREASON: ${r.reason}`);

console.log('\nFIXED PHYSICS');
console.log(`  GRAVITY=${GRAVITY} DRY_MASS=${DRY_MASS} MAX_THRUST=${MAX_THRUST} BURN_RATE=${BURN_RATE}`);
console.log(`  FUEL_START=${FUEL_START} MAX_ANGULAR_ACCEL=${MAX_ANGULAR_ACCEL} MAX_ANGULAR_RATE=${MAX_ANGULAR_RATE} DT=1/60`);

// Determinism proof: run again and compare byte-for-byte.
const r2 = run();
const sameVerdict = JSON.stringify(r.touchdown) === JSON.stringify(r2.touchdown);
const sameTraj = JSON.stringify(r.trajectory) === JSON.stringify(r2.trajectory);
console.log(`\nDETERMINISTIC: ${sameVerdict && sameTraj ? 'YES (two runs are byte-identical)' : 'NO'}`);

console.log('\nTRAJECTORY JSON');
console.log(JSON.stringify(r.trajectory));

// Non-zero exit on crash so CI would catch it.
process.exit(r.verdict === 'LANDED' ? 0 : 1);