#!/usr/bin/env node
// Headless test: runs the autopilot twice in Node, checks determinism,
// prints the verdict, the final numbers, and the trajectory JSON.
import { run, judge, CONST, START, LIMITS } from './sim.mjs';

const a = run();
const b = run();
const ja = JSON.stringify(a.frames);
const jb = JSON.stringify(b.frames);
const deterministic = ja === jb;

const v = a.verdict;
const bar = '='.repeat(52);
console.log(bar);
console.log(`  ${v.landed ? 'LANDED' : 'CRASHED'}`);
console.log(bar);
for (const line of Object.values(v.numbers)) console.log('  ' + line);
if (!v.landed) console.log(`  REASON: ${v.reason}`);
console.log(`  sim time = ${a.t.toFixed(2)} s  (${a.steps} steps @ ${CONST.DT.toFixed(6)} s)`);
console.log(`  DETERMINISM: ${deterministic ? 'PASS — two runs byte-identical' : 'FAIL — runs differ'}`);
console.log(bar);
console.log('TRAJECTORY JSON:');
console.log(ja);
process.exit(v.landed && deterministic ? 0 : 1);
