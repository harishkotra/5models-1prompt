export const meta = {
  name: 'lunar-descent-verify',
  description: 'Adversarially verify the Lunar Descent build against its spec',
  phases: [
    { title: 'Audit', detail: 'six independent auditors incl. live browser run' },
    { title: 'Verify', detail: 'adversarially verify each critical/major finding' },
  ],
}

const DIR = '/Users/shk/experiments/builds/5-models/qwen-3.8-flash'

const SPEC = `
FIXED PHYSICS: GRAVITY=1.62 m/s^2 (downward); DRY_MASS=500 kg; MAX_THRUST=3000 N (main engine, along the lander's body-up axis); BURN_RATE=8 kg/s at throttle 1.0; FUEL_START=250 kg; MAX_ANGULAR_ACCEL=90 deg/s^2 (RCS torque); MAX_ANGULAR_RATE=45 deg/s; DT=1/60 s fixed timestep, never variable.
STATE: x, y (altitude, up positive), vx, vy, theta (deg, 0 upright, positive tilts the nose right), omega (deg/s), fuel (kg). CONTROLS each step: throttle in [0,1], torque in [-1,1].
INTEGRATION (exact order): mass = DRY_MASS + fuel; thrust_dir = (sin(theta), cos(theta)) with theta converted to radians; F = (throttle*MAX_THRUST)*thrust_dir; a = F/mass + (0,-GRAVITY); v += a*DT; pos += v*DT (semi-implicit Euler); fuel -= throttle*BURN_RATE*DT; if fuel<=0 then fuel=0 and throttle forced to 0; omega = clamp(omega + torque*MAX_ANGULAR_ACCEL*DT, -MAX_ANGULAR_RATE, +MAX_ANGULAR_RATE); theta += omega*DT.
START STATE: x=0, y=100, vx=+5, vy=-10, theta=0, omega=0, fuel=250.
WIN CONDITION at touchdown (y <= 0): |vy| <= 3 m/s, |vx| <= 2 m/s, |theta| <= 10 deg, |x| <= 15 m, fuel >= 0. Landing outside those limits is a CRASH (a valid expected result). The verdict banner must state LANDED or CRASHED plus the four touchdown numbers (vy, vx, tilt, x offset) and fuel remaining; on crash, name the reason in plain words, e.g. "TOO FAST: vy = 7.2 m/s (limit 3.0)".
AUTOPILOT: deterministic (no Math.random, no Date.now, no wall-clock; same result every run), uses only throttle and torque (no state edits, no teleporting), must land from the fixed start state within 300 s of sim time, and its control law must be commented in 3-5 lines.
MANUAL MODE: arrow keys / WASD: up = throttle up, left/right = torque, Space = full throttle.
TRAJECTORY: every 6th step record {t, x, y, vx, vy, theta, fuel, throttle}. index.html has a "COPY TRAJECTORY JSON" button copying that array; test.mjs prints the same array to stdout.
FILES: sim.mjs = pure physics + autopilot, no DOM/canvas/globals, exports the constants, a step() function, an autopilot() controller, and run(). index.html = canvas 2D visual + HUD + controls, imports sim.mjs. test.mjs = headless Node run of the autopilot printing verdict + final numbers + trajectory JSON. index.html and test.mjs MUST share sim.mjs; physics exists in exactly one place; no duplication anywhere.
VISUAL SPEC (canvas 2D, no libraries, no three.js): dark starfield, grey lunar surface, one flat landing pad with a marked target zone, lander drawn as body + legs + a flame whose length scales with throttle. Camera follows the lander but clamps at the ground. Trajectory trail drawn as a faint line.
HUD (required): altitude, vx, vy, tilt, fuel, throttle, plus a small constants panel showing the FIXED physics values so anyone can confirm identical physics.
UI: two buttons "RUN AUTOPILOT" (instant, verdict immediately) and "REPLAY SLOW" (same run, real time, for filming). Loading/error states not needed (no network calls).
FOOTER verbatim: "Built By Harish Kotra" linking to https://harishkotra.me and "Checkout my other builds" linking to https://dailybuild.xyz.
NON-GOALS: no LLM calls, no API keys, no settings panel, no backend, no database, no auth, no deploy config, no npm dependencies, no CDN, no build step. Runs offline via "python3 -m http.server 8080" then http://localhost:8080 (ES modules do not load from file:// — the README must state that).
ACCEPTANCE: (1) serves offline over http; (2) fixed constants printed on screen; (3) autopilot deterministic — two runs byte-identical verdicts AND trajectories; (4) node test.mjs prints verdict + final numbers + trajectory JSON with no browser; (5) single shared physics source; (6) footer links verbatim; (7) no three.js / no external libraries; (8) node test.mjs actually executed and landing.
`

const COMMON = `You are auditing a freshly built, self-contained lunar lander simulator at ${DIR}: sim.mjs (pure physics + deterministic autopilot + run()), index.html (canvas 2D + HUD + controls), test.mjs (headless), README.md. HARD RULES: do NOT modify sim.mjs, index.html, test.mjs, or README.md. Scratch files go only under ${DIR}/verify-scratch/ (mkdir -p as needed). Do not kill processes you did not start. Report findings with severity: critical = spec violated or app broken; major = requirement not met in a way a reviewer would reject; minor = cosmetic/quality; info = observation. For every finding include file, a concrete detail with line references, and a suggested fix. If everything in your area passes, return zero findings and say so in the summary. Your structured output is machine-consumed; put any evidence snippets in "extras" (a string).\n\nTHE FULL SPECIFICATION:\n${SPEC}\n`

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'detail'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
          detail: { type: 'string' },
          file: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    extras: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['real', 'explanation'],
  properties: {
    real: { type: 'boolean' },
    explanation: { type: 'string' },
    fix: { type: 'string' },
  },
}

const auditors = [
  {
    key: 'physics',
    prompt: `${COMMON}\nYOUR DIMENSION: physics fidelity of sim.mjs. Compare sim.mjs line-by-line against the FIXED PHYSICS / INTEGRATION / START STATE / WIN CONDITION sections above. Verify every constant value; the integration order character-for-character in intent (semi-implicit Euler: velocity updates before position; the new omega is used for the theta update; throttle forced to zero when the tank is empty). Verify step() is pure (no state mutation), controls are clamped to throttle [0,1] / torque [-1,1], DT is a fixed 1/60. Verify judge()/run() implement the five win checks and the 300 s limit, and that trajectory records every 6th step with EXACTLY the fields {t, x, y, vx, vy, theta, fuel, throttle}. Verify the autopilot is deterministic: grep sim.mjs for Math.random, Date.now, performance.now, Date( — none allowed; it may only return {throttle, torque} and never mutate state. Then run node test.mjs from ${DIR} yourself and confirm the shipped autopilot LANDs within 300 s. Also sanity-check physical plausibility of the reported touchdown numbers (e.g. vy at touchdown consistent with the recorded trajectory's last two points within one step of DT).`,
  },
  {
    key: 'single-source',
    prompt: `${COMMON}\nYOUR DIMENSION: architecture / single source of truth / headless test. (a) Confirm index.html and test.mjs both import from ./sim.mjs and that NO second implementation of the physics exists anywhere (grep all files for GRAVITY, MAX_THRUST, BURN_RATE, DT =, step functions, integration math; anything duplicated = critical). (b) Confirm index.html's manual mode and replay only CALL step()/autopilot()/run()/judge()/record() from sim.mjs — rendering math, camera, keyboard ramping are UI, not physics; judge any physics logic found in index.html as a finding. (c) Run node test.mjs twice in separate processes, capture stdout both times, cmp them byte-for-byte (determinism AC3) — report the hash in extras; confirm stdout contains the VERDICT banner, the four touchdown numbers plus fuel, and a TRAJECTORY_JSON array (parse it: it must be an array of objects each with exactly t,x,y,vx,vy,theta,fuel,throttle). (d) Confirm test.mjs needs no browser/network (it only imports sim.mjs). (e) README.md states that ES modules will not load from file:// and gives the python3 -m http.server 8080 instructions.`,
  },
  {
    key: 'autopilot-crosscheck',
    prompt: `${COMMON}\nYOUR DIMENSION: independent autopilot cross-check. Step 1 — WITHOUT reading the autopilot implementation in sim.mjs first (you may read step(), initialState(), judge(), run(), and the exported constants; skip the autopilot() body and its comments), independently design your own deterministic lunar descent control law against the spec physics above. Implement it in ${DIR}/verify-scratch/xcheck.mjs: import { step, initialState, judge } from '../sim.mjs', run your controller through the same fixed-DT loop until y <= 0 or 300 s, use only throttle/torque. Iterate in Node until YOUR controller achieves LANDED. Report its touchdown numbers and sim time in extras. Step 2 — determinism of the shipped code: run node -e that calls run() from ../sim.mjs 20 times and asserts every result JSON.stringify is identical; report true/false in extras. Step 3 — only now read the shipped autopilot() body: verify its comment block is 3-5 lines describing the control law strategy, that it contains no nondeterministic calls, and it never writes to state. Findings: any inability to land with an independent controller despite spec compliance (may indicate impossible start state — that would be spec-level, report critical), missing/short autopilot comment, nondeterminism.`,
  },
  {
    key: 'browser',
    prompt: `${COMMON}\nYOUR DIMENSION: live browser verification of index.html. From ${DIR} start a static server on a port nobody else will use: (cd ${DIR} && python3 -m http.server 8731 &) — note its PID, and kill ONLY that PID when done. Use the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_press_key, browser_evaluate, browser_console_messages, browser_take_screenshot saved under ${DIR}/verify-scratch/shots/) against http://localhost:8731/. Check, in order: (1) page loads, canvas renders, zero console errors (console warnings: note as minor). (2) The HUD shows altitude, vx, vy, tilt, fuel, throttle and the constants panel shows the eight fixed physics values (grep the snapshot text: GRAVITY 1.62, DRY_MASS 500, MAX_THRUST 3000, BURN_RATE 8, FUEL_START 250, MAX_ANGULAR_ACCEL 90, MAX_ANGULAR_RATE 45, DT 1/60). (3) Click "RUN AUTOPILOT": a big banner must appear reading LANDED with the four touchdown numbers (vy, vx, tilt, x) and fuel; read the banner text and put it in extras; screenshot. (4) Click "REPLAY SLOW": mode changes, then within ~18 s of real time the sim clock should have advanced ~1x realtime and the banner should reappear with the SAME verdict and the SAME numbers as step 3 (determinism in-browser); poll the HUD via browser_evaluate, screenshot mid-flight (verify a flame is visible while throttle > 0 and the lander visibly moves). (5) Click "FLY MANUAL": dispatch keyboard events via browser_evaluate, e.g. window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true})) several times then keyup, and confirm the throttle HUD readout rose; also try 'space' (Key: ' ') = full throttle 100%; left/right torque changes tilt. (6) Click "COPY TRAJECTORY JSON": button text should change to COPIED <n> POINTS (clipboard readback may be blocked — the button feedback is sufficient). (7) Footer contains exactly "Built By Harish Kotra" -> https://harishkotra.me and "Checkout my other builds" -> https://dailybuild.xyz. (8) Take a final full-viewport screenshot. Any broken interaction = critical; missing HUD field or visual element = major.`,
  },
  {
    key: 'ui-spec',
    prompt: `${COMMON}\nYOUR DIMENSION: visual spec and UI requirements compliance, mostly static review of index.html (plus opening it headless only if you need to disambiguate — the browser auditor covers live behavior; do not run a server on port 8731). Verify each VISUAL SPEC element has real implementation, not just a TODO: dark starfield (deterministically seeded, NOT Math.random at render — Math.random for stars is a determinism-purity finding only if used in physics; for pure decoration flag minor at most), grey lunar surface, ONE flat landing pad with a MARKED target zone, lander = body + legs + flame whose LENGTH SCALES WITH THROTTLE (check the draw code), camera follows the lander but clamps at the ground, trajectory trail as a faint line. Verify the manual key mapping literally matches the spec: up/W = throttle up, left/right = torque, space = full throttle (and note extra conveniences like down/S as fine). Verify the two required buttons are labeled "RUN AUTOPILOT" and "REPLAY SLOW" and that RUN AUTOPILOT is instant while REPLAY SLOW advances at fixed DT in real time (accumulator with clamped frame delta — check there is no variable-dt passed into step()). Verify no external libraries / CDN scripts / npm deps / three.js anywhere (grep for <script src, import from http, package.json, node_modules). Verify the constants panel is populated from sim.mjs data (single source) rather than re-typed literals in index.html (re-typed literals = major duplication finding).`,
  },
  {
    key: 'acceptance-critic',
    prompt: `${COMMON}\nYOUR DIMENSION: completeness critic. Go through the ACCEPTANCE list and every NON-GOALS / REQUIREMENTS line in the spec above and verify each against the files in ${DIR} (read them; run node test.mjs yourself in ${DIR}; you may not run an http server — the browser auditor owns that). Ask specifically: what is MISSING or HALF-DONE that the spec demanded? Examples to check: does the verdict name crash reasons in plain words with numbers when limits are violated (test the judge function directly with a synthetic crash state via node -e)? Does test.mjs exit non-zero on crash (nice) — is that harmful for acceptance? Is the autopilot comment block present? Does every 6th step record include throttle? Is the REPLAY SLOW verdict guaranteed identical to instant? Anything on the non-goals list that snuck in (package.json, CDN link, analytics)? Do not report style opinions; only requirement gaps.`,
  },
]

phase('Audit')
const raw = await parallel(
  auditors.map((a) => () =>
    agent(a.prompt, { label: `audit:${a.key}`, phase: 'Audit', schema: AUDIT_SCHEMA })
      .then((r) => (r ? { key: a.key, ...r } : null))
  )
)
const audits = raw.filter(Boolean)
log(`audit reports received: ${audits.length}/6 (${audits.map((a) => a.key).join(', ')})`)

const seen = new Set()
const merged = []
for (const r of audits) {
  for (const f of r.findings || []) {
    const k = `${(f.file || '')}|${(f.title || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 60)}`
    if (seen.has(k)) continue
    seen.add(k)
    merged.push({ ...f, source: r.key })
  }
}
const toVerify = merged.filter((f) => f.severity === 'critical' || f.severity === 'major')
log(`${merged.length} unique findings; adversarially verifying ${toVerify.length} critical/major`)

phase('Verify')
const verified = (
  await parallel(
    toVerify.map((f) => () =>
      agent(
        `${COMMON}\nYou are an adversarial verifier. A code auditor claims this finding about the build in ${DIR}:\n\nTITLE: ${f.title}\nSEVERITY: ${f.severity}\nFILE: ${f.file || 'unspecified'}\nDETAIL: ${f.detail}\nPROPOSED FIX: ${f.fix || 'none given'}\n\nYour job is to REFUTE it. Read the actual file(s), and where the claim is about runtime behavior, run the real thing (node; you may start python3 -m http.server 8799 for a browser claim ONLY if the claim needs a live page, and kill it when done — if a server on 8799 is already in use, skip live checks and note that). A finding is real=true ONLY if the quoted spec requirement is genuinely violated or the app genuinely breaks in normal use. Findings about hypothetical-future polish, style opinions, or claims that misread the code are refuted (real=false). If refuting, quote the exact code/line that disproves it.`,
        { label: `verify:${(f.title || '').slice(0, 40)}`, phase: 'Verify', schema: VERDICT_SCHEMA }
      ).then((v) => ({ ...f, confirmed: v ? v.real : null, verifyNote: v ? v.explanation : 'verifier unavailable', verifyFix: v && v.fix ? v.fix : f.fix }))
    )
  )
).filter(Boolean)

const confirmed = verified.filter((f) => f.confirmed !== false)
const refuted = verified.filter((f) => f.confirmed === false)
log(`confirmed ${confirmed.length}, refuted ${refuted.length}, unverified minor/info ${merged.length - toVerify.length}`)

return {
  auditSummaries: audits.map((a) => ({ key: a.key, summary: a.summary, extras: a.extras || '' })),
  confirmedFindings: confirmed,
  refutedFindings: refuted.map((f) => ({ title: f.title, severity: f.severity, why: f.verifyNote })),
  minorInfoFindings: merged.filter((f) => f.severity !== 'critical' && f.severity !== 'major'),
}
