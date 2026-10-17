/**
 * Doing a 5K — original training plan generator.
 * 3 days/week → 12 weeks; 4 → 10; 5 → 8.
 * Every session: 5 min warm-up walk, main block, 5 min cool-down walk.
 */

const WARMUP_SEC = 5 * 60;
const COOLDOWN_SEC = 5 * 60;

export const WEEKS_BY_DAYS = { 3: 12, 4: 10, 5: 8 };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weeksForDaysPerWeek(days) {
  return WEEKS_BY_DAYS[days] ?? 12;
}

export function totalSessions(daysPerWeek) {
  return weeksForDaysPerWeek(daysPerWeek) * daysPerWeek;
}

/** Progress 0–1 across the program; jogLittle starts slightly ahead. */
function sessionProgress(sessionIndex, total, level) {
  const offset = level === "jogLittle" ? 0.14 : 0;
  const span = total - 1;
  const raw = span > 0 ? sessionIndex / span : 1;
  return Math.min(1, raw * (1 - offset) + offset);
}

/**
 * Build main-block intervals (seconds). Original progression:
 * early = short jogs in walks; mid = classic intervals; late = fewer breaks; end = continuous.
 */
function buildMainBlock(progress) {
  const steps = [];
  if (progress < 0.18) {
    const cycles = 6;
    for (let i = 0; i < cycles; i++) {
      steps.push({ type: "walk", label: "Brisk walk", durationSeconds: 150 });
      steps.push({ type: "run", label: "Easy jog", durationSeconds: 30 + Math.floor(progress * 120) });
    }
  } else if (progress < 0.38) {
    const jog = 60 + Math.floor((progress - 0.18) * 400);
    const walk = Math.max(60, 150 - Math.floor((progress - 0.18) * 200));
    for (let i = 0; i < 5; i++) {
      steps.push({ type: "run", label: "Easy jog", durationSeconds: jog });
      steps.push({ type: "walk", label: "Recovery walk", durationSeconds: walk });
    }
  } else if (progress < 0.58) {
    const jog = 120 + Math.floor((progress - 0.38) * 300);
    const walk = Math.max(45, 90 - Math.floor((progress - 0.38) * 150));
    for (let i = 0; i < 4; i++) {
      steps.push({ type: "run", label: "Steady jog", durationSeconds: jog });
      steps.push({ type: "walk", label: "Recovery walk", durationSeconds: walk });
    }
  } else if (progress < 0.78) {
    const jog = 300 + Math.floor((progress - 0.58) * 450);
    const walk = progress < 0.68 ? 90 : 60;
    steps.push({ type: "run", label: "Steady run", durationSeconds: jog });
    if (walk > 0) {
      steps.push({ type: "walk", label: "Short walk", durationSeconds: walk });
      steps.push({ type: "run", label: "Steady run", durationSeconds: jog });
    }
  } else if (progress < 0.92) {
    const runMin = 12 + Math.floor((progress - 0.78) * 50);
    steps.push({ type: "run", label: "Continuous easy run", durationSeconds: runMin * 60 });
  } else {
    steps.push({ type: "run", label: "Your 5K — go at your pace", durationSeconds: 30 * 60 });
  }
  return steps;
}

function withBookends(mainSteps) {
  return [
    { type: "walk", label: "Warm-up walk", durationSeconds: WARMUP_SEC },
    ...mainSteps,
    { type: "walk", label: "Cool-down walk", durationSeconds: COOLDOWN_SEC },
  ];
}

function sessionTitle(progress, weekIndex, dayInWeek) {
  if (progress >= 0.92) return "5K celebration run";
  if (progress >= 0.78) return `Week ${weekIndex + 1} · Long easy run`;
  if (progress >= 0.58) return `Week ${weekIndex + 1} · Build endurance`;
  if (progress >= 0.38) return `Week ${weekIndex + 1} · Run / walk`;
  return `Week ${weekIndex + 1} · Walk with jogs`;
}

function sessionSummary(steps) {
  const main = steps.filter((s) => s.label !== "Warm-up walk" && s.label !== "Cool-down walk");
  const runSec = main.filter((s) => s.type === "run").reduce((a, s) => a + s.durationSeconds, 0);
  const runMin = Math.round(runSec / 60);
  return runMin > 0 ? `~${runMin} min of running` : "Walking with short jogs";
}

/**
 * @returns {{ meta: object, workouts: Workout[] }}
 */
export function generatePlan({ daysPerWeek, level, preferredDays, startDateISO, name }) {
  const weeks = weeksForDaysPerWeek(daysPerWeek);
  const total = totalSessions(daysPerWeek);
  const workouts = [];
  let sessionIndex = 0;

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < daysPerWeek; d++) {
      const progress = sessionProgress(sessionIndex, total, level);
      const main = buildMainBlock(progress);
      const steps = withBookends(main);
      const weekday = preferredDays[d % preferredDays.length];
      workouts.push({
        id: `w${w}-d${d}`,
        weekIndex: w,
        dayInWeek: d,
        sessionIndex,
        weekday,
        title: sessionTitle(progress, w, d),
        summary: sessionSummary(steps),
        steps,
        isCelebration: progress >= 0.92,
      });
      sessionIndex++;
    }
  }

  return {
    meta: {
      name: name || "",
      daysPerWeek,
      level,
      preferredDays,
      startDateISO,
      weeks,
      totalSessions: total,
      createdAt: new Date().toISOString(),
    },
    workouts,
  };
}

/**
 * Rebuild plan from a given week index onward, keeping completed workout ids where possible.
 */
export function replanFromWeek(state, fromWeekIndex) {
  const { meta, workouts, completed } = state;
  const kept = workouts.filter((w) => w.weekIndex < fromWeekIndex);
  const completedBefore = new Set(
    (completed || []).filter((c) => {
      const w = workouts.find((x) => x.id === c.workoutId);
      return w && w.weekIndex < fromWeekIndex;
    }).map((c) => c.workoutId)
  );

  const fresh = generatePlan({
    daysPerWeek: meta.daysPerWeek,
    level: meta.level,
    preferredDays: meta.preferredDays,
    startDateISO: meta.startDateISO,
    name: meta.name,
  });

  const newTail = fresh.workouts.filter((w) => w.weekIndex >= fromWeekIndex);
  const merged = [...kept, ...newTail.map((w, i) => ({
    ...w,
    sessionIndex: kept.length + i,
  }))];

  return {
    ...state,
    meta: { ...fresh.meta, replannedFromWeek: fromWeekIndex },
    workouts: merged,
    completed: (completed || []).filter((c) => completedBefore.has(c.workoutId)),
  };
}

export function scheduledDateForWorkout(startDateISO, workout, allWorkouts, daysPerWeek) {
  const start = parseDateOnly(startDateISO);
  const ordered = [...allWorkouts].sort((a, b) => a.sessionIndex - b.sessionIndex);
  const idx = ordered.findIndex((w) => w.id === workout.id);
  if (idx < 0) return start;

  let cursor = start;
  let lastWeek = -1;
  for (let i = 0; i <= idx; i++) {
    const w = ordered[i];
    if (w.weekIndex !== lastWeek && i > 0) {
      cursor = nextWeekAnchor(cursor, ordered[i - 1].weekday, w.weekday);
    } else if (i > 0) {
      cursor = nextDayOnOrAfter(cursor, w.weekday);
    }
    lastWeek = w.weekIndex;
  }
  return cursor;
}

function parseDateOnly(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function nextDayOnOrAfter(from, weekday) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function nextWeekAnchor(from, prevWeekday, weekday) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function formatDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function workoutTotalSeconds(workout) {
  return workout.steps.reduce((a, s) => a + s.durationSeconds, 0);
}

export { DAY_NAMES };
