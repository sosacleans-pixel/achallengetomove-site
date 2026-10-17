/**
 * Doing a 5K — weekly bodyweight strength sessions (original content).
 */

const WARMUP_SEC = 3 * 60;
const COOLDOWN_SEC = 2 * 60;
const REST_SEC = 30;

/** @typedef {'foundation'|'build'|'strong'} Phase */

export const EXERCISES = {
  squats: {
    name: "Squats",
    cue: "Feet hip-width, sit back like a chair, knees track over toes, chest lifted.",
    easier: "Sit and stand from a sturdy chair, using hands lightly if needed.",
    harder: "Pause 2 seconds at the bottom of each squat.",
  },
  reverseLunges: {
    name: "Reverse lunges",
    cue: "Step one foot back, lower until both knees bend softly, then drive up.",
    easier: "Hold a wall or counter for balance; smaller steps.",
    harder: "Add a 1-second pause at the bottom.",
  },
  gluteBridges: {
    name: "Glute bridges",
    cue: "Lie on your back, feet flat, lift hips until shoulders–hips–knees line up, squeeze glutes.",
    easier: "Smaller lift range; feet closer to your body.",
    harder: "Hold the top for 3 seconds each rep.",
  },
  singleLegGluteBridge: {
    name: "Single-leg glute bridge",
    cue: "Same bridge, one foot lifted; keep hips level.",
    easier: "Keep the lifted foot on the floor with just a light touch.",
    harder: "Slow 3-count lift and lower.",
  },
  stepUps: {
    name: "Step-ups",
    cue: "Use a bottom stair; press through the whole foot, stand tall, step down with control.",
    easier: "Lower step or tap the stair without full weight.",
    harder: "Slow 3-count on the way down.",
  },
  calfRaises: {
    name: "Calf raises",
    cue: "Feet hip-width, rise onto the balls of your feet, lower with control.",
    easier: "Hold a wall; smaller range.",
    harder: "Single-leg calf raises.",
  },
  wallSit: {
    name: "Wall sit",
    cue: "Back on wall, slide down until thighs are roughly parallel, breathe steadily.",
    easier: "Higher position with less knee bend.",
    harder: "Hold longer or lift one foot slightly.",
  },
  lateralLunges: {
    name: "Lateral lunges",
    cue: "Step wide to the side, sit into one hip, keep the other leg straight, alternate.",
    easier: "Shorter step, hands on hips.",
    harder: "Pause at the bottom each side.",
  },
  plank: {
    name: "Plank",
    cue: "Forearms or hands under shoulders, body in one line, brace your core.",
    easier: "Knees down or incline hands on a counter.",
    harder: "Lift one foot a few inches.",
  },
  sidePlank: {
    name: "Side plank",
    cue: "Forearm under shoulder, stack feet or stagger, lift hips in a straight line.",
    easier: "Knees bent, bottom knee on the floor.",
    harder: "Top leg lifts a few inches.",
  },
  deadBug: {
    name: "Dead bug",
    cue: "On your back, arms up, knees bent; extend opposite arm and leg, keep low back gently pressed down.",
    easier: "Move only arms or only legs.",
    harder: "Slower tempo, longer reach.",
  },
  birdDog: {
    name: "Bird dog",
    cue: "On hands and knees, reach opposite arm and leg long, avoid rocking hips.",
    easier: "Lift only arm or only leg.",
    harder: "3-second hold each rep.",
  },
  hollowHold: {
    name: "Hollow hold",
    cue: "On your back, lift shoulders and legs slightly, ribs down, breathe.",
    easier: "Bend knees or keep feet on the floor.",
    harder: "Arms overhead, legs lower.",
  },
  mountainClimbers: {
    name: "Mountain climbers (slow)",
    cue: "High plank, draw one knee toward chest slowly, alternate with control.",
    easier: "Hands elevated on a counter.",
    harder: "Longer pause with knee tucked.",
  },
  pushUps: {
    name: "Push-ups",
    cue: "Body in a straight line, lower chest toward hands, press back up.",
    easier: "Wall push-ups, then incline on a counter, then knees.",
    harder: "Full push-ups with slow lowering.",
  },
  superman: {
    name: "Superman",
    cue: "Lie face down, lift arms and legs slightly, squeeze shoulder blades and glutes.",
    easier: "Lift only arms or only legs.",
    harder: "Hold 3 seconds at the top.",
  },
  catCow: {
    name: "Cat-cow",
    cue: "On hands and knees, round spine on exhale, arch gently on inhale.",
    easier: "Smaller motion seated in a chair.",
    harder: "Slow 4-count each way.",
  },
  childPose: {
    name: "Child's pose",
    cue: "Knees wide or together, sit hips toward heels, arms forward, breathe.",
    easier: "Rest forehead on stacked hands.",
    harder: "Walk hands to each side for a side stretch.",
  },
};

/** Exercises featured per phase (for owner report / progression). */
export const PHASE_LIBRARY = {
  foundation: {
    A: ["squats", "pushUps", "gluteBridges", "plank", "reverseLunges"],
    B: ["birdDog", "superman", "gluteBridges", "deadBug", "calfRaises"],
  },
  build: {
    A: ["squats", "pushUps", "reverseLunges", "plank", "stepUps", "deadBug"],
    B: ["birdDog", "superman", "singleLegGluteBridge", "sidePlank", "lateralLunges"],
  },
  strong: {
    A: ["squats", "pushUps", "reverseLunges", "plank", "wallSit", "mountainClimbers"],
    B: ["birdDog", "superman", "singleLegGluteBridge", "sidePlank", "hollowHold", "calfRaises"],
  },
};

function phaseForWeek(weekIndex, totalWeeks) {
  const p = weekIndex / Math.max(1, totalWeeks - 1);
  if (p < 0.34) return "foundation";
  if (p < 0.67) return "build";
  return "strong";
}

function phaseParams(phase) {
  if (phase === "foundation") return { rounds: 2, repScale: 1, holdScale: 1, pushVariant: "wall" };
  if (phase === "build") return { rounds: 2, repScale: 1.25, holdScale: 1.2, pushVariant: "incline" };
  return { rounds: 3, repScale: 1.5, holdScale: 1.4, pushVariant: "knees" };
}

function reps(base, scale) {
  return Math.max(6, Math.round(base * scale));
}

function holdSec(base, scale) {
  return Math.max(15, Math.round(base * scale));
}

function pushLabel(variant) {
  if (variant === "wall") return "Wall push-ups";
  if (variant === "incline") return "Incline push-ups (counter)";
  if (variant === "knees") return "Knee push-ups";
  return "Push-ups";
}

function exStep(id, { reps: r, holdSeconds, round }) {
  const ex = EXERCISES[id];
  const label = id === "pushUps" ? ex.name : ex.name;
  if (holdSeconds) {
    return {
      mode: "timed",
      exerciseId: id,
      label,
      description: ex.cue,
      easier: ex.easier,
      harder: ex.harder,
      durationSeconds: holdSeconds,
      round,
      voiceCue: `${label}, hold ${holdSeconds} seconds`,
    };
  }
  return {
    mode: "reps",
    exerciseId: id,
    label,
    description: ex.cue,
    easier: ex.easier,
    harder: ex.harder,
    reps: r,
    round,
    voiceCue: `Next: ${label}, ${r} reps`,
  };
}

function restStep(round) {
  return { mode: "rest", label: "Rest", durationSeconds: REST_SEC, round, voiceCue: "Rest." };
}

function warmupSteps() {
  return [
    { mode: "timed", label: "March in place", description: "Lift knees comfortably, swing arms.", durationSeconds: 60, voiceCue: "March in place." },
    { mode: "timed", label: "Leg swings", description: "Hold a wall; swing each leg forward and back.", durationSeconds: 40, voiceCue: "Leg swings." },
    { mode: "timed", label: "Hip circles", description: "Hands on hips, draw slow circles.", durationSeconds: 40, voiceCue: "Hip circles." },
    { mode: "timed", label: "Arm circles", description: "Small to large circles, forward then back.", durationSeconds: 60, voiceCue: "Arm circles." },
  ];
}

function cooldownSteps() {
  return [
    { mode: "timed", label: "Cat-cow", description: EXERCISES.catCow.cue, durationSeconds: 45, voiceCue: "Cat-cow stretch." },
    { mode: "timed", label: "Child's pose", description: EXERCISES.childPose.cue, durationSeconds: 75, voiceCue: "Child's pose. Breathe." },
  ];
}

function circuitA(phase, params) {
  const ids = PHASE_LIBRARY[phase].A;
  const steps = [];
  for (let round = 1; round <= params.rounds; round++) {
    for (const id of ids) {
      if (id === "pushUps") {
        const step = exStep("pushUps", { reps: reps(8, params.repScale), round });
        step.label = pushLabel(params.pushVariant);
        step.voiceCue = `Next: ${step.label}, ${step.reps} reps`;
        steps.push(step);
      } else if (id === "plank" || id === "wallSit") {
        steps.push(exStep(id, { holdSeconds: holdSec(id === "wallSit" ? 25 : 20, params.holdScale), round }));
      } else {
        steps.push(exStep(id, { reps: reps(10, params.repScale), round }));
      }
      steps.push(restStep(round));
    }
  }
  return steps;
}

function circuitB(phase, params) {
  const ids = PHASE_LIBRARY[phase].B;
  const steps = [];
  for (let round = 1; round <= params.rounds; round++) {
    for (const id of ids) {
      if (id === "plank" || id === "sidePlank" || id === "hollowHold") {
        const base = id === "hollowHold" ? 15 : 20;
        steps.push(exStep(id, { holdSeconds: holdSec(base, params.holdScale), round }));
      } else if (id === "superman") {
        steps.push(exStep(id, { reps: reps(10, params.repScale), round }));
      } else {
        steps.push(exStep(id, { reps: reps(12, params.repScale), round }));
      }
      steps.push(restStep(round));
    }
  }
  return steps;
}

export function buildStrengthSession(weekIndex, totalWeeks, sessionType) {
  const phase = phaseForWeek(weekIndex, totalWeeks);
  const params = phaseParams(phase);
  const circuit = sessionType === "B" ? circuitB(phase, params) : circuitA(phase, params);
  const steps = [...warmupSteps(), ...circuit, ...cooldownSteps()];
  return { phase, steps };
}

export function defaultStrengthDays(runDays, count) {
  const run = new Set(runDays);
  const anchor = Math.min(...runDays);
  const candidates = [];
  for (let i = 1; i <= 7; i++) {
    const d = (anchor + i) % 7;
    if (!run.has(d)) candidates.push(d);
  }
  if (candidates.length < count) {
    for (let d = 0; d < 7 && candidates.length < count; d++) {
      if (!run.has(d) && !candidates.includes(d)) candidates.push(d);
    }
  }
  return candidates.slice(0, count);
}

export function strengthDaysValid(runDays, strengthDays) {
  const run = new Set(runDays);
  return strengthDays.every((d) => !run.has(d));
}

export function generateStrengthWorkouts({ weeks, strengthDaysPerWeek, strengthPreferredDays }) {
  const workouts = [];
  for (let w = 0; w < weeks; w++) {
    for (let s = 0; s < strengthDaysPerWeek; s++) {
      const sessionType = s === 0 ? "A" : "B";
      const { phase, steps } = buildStrengthSession(w, weeks, sessionType);
      const focus =
        sessionType === "A"
          ? "Legs, push & core"
          : "Posterior chain, lower back & single-leg";
      workouts.push({
        id: `strength-w${w}-s${s}`,
        kind: "strength",
        weekIndex: w,
        strengthSlot: s,
        sessionType,
        weekday: strengthPreferredDays[s],
        title: `Strength ${sessionType} · ${focus}`,
        summary: `~15–20 min · ${phase} phase`,
        phase,
        steps,
      });
    }
  }
  return workouts;
}

export function strengthTotalEstimateSeconds(steps) {
  return steps.reduce((acc, s) => {
    if (s.mode === "reps") return acc + (s.reps || 10) * 3 + REST_SEC;
    return acc + (s.durationSeconds || 0);
  }, 0);
}

/** One-line circuit preview (first round only) for the session overview screen. */
export function strengthSessionOverview(workout) {
  const params = phaseParams(workout.phase);
  const seen = new Set();
  const circuit = [];
  for (const s of workout.steps) {
    if (s.mode !== "reps" && !(s.mode === "timed" && s.exerciseId)) continue;
    const key = s.exerciseId || s.label;
    if (seen.has(key)) continue;
    seen.add(key);
    const amount = s.reps ? `${s.reps} reps` : `${s.durationSeconds}s hold`;
    circuit.push({
      key,
      label: s.label,
      amount,
      description: s.description,
      easier: s.easier,
      harder: s.harder,
    });
  }
  const phaseLabel = workout.phase.charAt(0).toUpperCase() + workout.phase.slice(1);
  return {
    rounds: params.rounds,
    phaseLabel,
    circuit,
    restSeconds: REST_SEC,
  };
}

export { WARMUP_SEC, COOLDOWN_SEC, phaseForWeek };
