/**
 * Half marathon training plan (data module — coach can replace this file).
 * Beginner ~16 weeks · Average ~12 weeks · 3 or 4 run days per week.
 * Assumes ability to run ~30 minutes or a 5K continuously.
 */

import {
  defaultStrengthDays,
  generateStrengthWorkouts,
  strengthDaysValid,
} from "./strength.js";

const WARMUP_SEC = 5 * 60;
const COOLDOWN_SEC = 5 * 60;
const MI_TO_KM = 1.60934;

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EASY_PACE_MIN_PER_KM = 6.75;
const LONG_PACE_MIN_PER_KM = 7.25;
const TEMPO_PACE_MIN_PER_KM = 5.75;

export function weeksForHalfPlan(strengthLevel) {
  return strengthLevel === "beginner" ? 16 : 12;
}

export function kmToMiles(km) {
  return km / MI_TO_KM;
}

export function milesToKm(mi) {
  return mi * MI_TO_KM;
}

export function formatRaceDistance(units = "mi") {
  return units === "km" ? "21.1 km" : "13.1 mi";
}

export function formatDistance(km, units = "mi", digits = 1) {
  if (units === "km") return `${km.toFixed(digits)} km`;
  return `${kmToMiles(km).toFixed(digits)} mi`;
}

function kmToSeconds(km, paceMinPerKm) {
  return Math.round(km * paceMinPerKm * 60);
}

function withBookends(mainSteps) {
  return [
    { type: "walk", label: "Warm-up walk or easy jog", durationSeconds: WARMUP_SEC },
    ...mainSteps,
    { type: "walk", label: "Cool-down walk", durationSeconds: COOLDOWN_SEC },
  ];
}

/** Build-phase long runs in miles (cutbacks on every 4th week). */
const LONG_RUN_MILES_10_BUILD = [3, 3.5, 4, 3, 5, 6, 7, 5.5, 8.5, 10];
const LONG_RUN_MILES_14_BUILD = [
  3, 3.5, 4, 3, 4.5, 5, 5.5, 4.5, 6, 7, 8, 6.5, 9, 10.5,
];

/**
 * Long-run distance (km) per week index. Cutbacks every 4th week; 2-week taper at end.
 */
export function longRunProgressionKm(totalWeeks) {
  const taperWeeks = 2;
  const buildWeeks = totalWeeks - taperWeeks;
  const template = buildWeeks <= 10 ? LONG_RUN_MILES_10_BUILD : LONG_RUN_MILES_14_BUILD;
  const buildMiles = [];
  for (let i = 0; i < buildWeeks; i++) {
    const src = template[Math.min(i, template.length - 1)];
    buildMiles.push(src);
  }
  const peakMi = Math.max(...buildMiles);
  if (peakMi < 10) {
    const last = buildMiles.length - 1;
    buildMiles[last] = 10;
    if (last > 0) buildMiles[last - 1] = Math.max(buildMiles[last - 1], 9);
  }
  const schedule = buildMiles.map(milesToKm);
  schedule.push(milesToKm(7));
  schedule.push(milesToKm(4.5));
  return schedule.slice(0, totalWeeks);
}

function phaseForWeek(weekIndex, totalWeeks) {
  const p = weekIndex / Math.max(1, totalWeeks - 1);
  if (p < 0.35) return "base";
  if (p < 0.72) return "build";
  return "peak";
}

function easyRunSeconds(weekIndex, totalWeeks) {
  const base = 28 + Math.floor((weekIndex / Math.max(1, totalWeeks - 1)) * 22);
  return base * 60;
}

function buildWorkoutSteps(phase, weekIndex) {
  if (phase === "base") {
    return [
      { type: "run", label: "Easy run", durationSeconds: 8 * 60, effort: "easy" },
      { type: "run", label: "Strides — smooth and quick (RPE 6)", durationSeconds: 20 },
      { type: "walk", label: "Walk recovery", durationSeconds: 60 },
      { type: "run", label: "Stride", durationSeconds: 20 },
      { type: "walk", label: "Walk recovery", durationSeconds: 60 },
      { type: "run", label: "Stride", durationSeconds: 20 },
      { type: "walk", label: "Walk recovery", durationSeconds: 60 },
      { type: "run", label: "Stride", durationSeconds: 20 },
      { type: "walk", label: "Walk recovery", durationSeconds: 60 },
      { type: "run", label: "Easy jog home", durationSeconds: 5 * 60, effort: "easy" },
    ];
  }
  if (phase === "build") {
    const tempoSec = kmToSeconds(2.4, TEMPO_PACE_MIN_PER_KM);
    return [
      { type: "run", label: "Easy run", durationSeconds: 10 * 60, effort: "easy" },
      { type: "run", label: "Tempo — comfortably hard (RPE 7)", durationSeconds: tempoSec, effort: "tempo" },
      { type: "walk", label: "Recovery walk", durationSeconds: 3 * 60 },
      { type: "run", label: "Tempo — comfortably hard (RPE 7)", durationSeconds: tempoSec, effort: "tempo" },
      { type: "run", label: "Easy jog", durationSeconds: 8 * 60, effort: "easy" },
    ];
  }
  const intervalRun = 3 * 60;
  const recover = 90;
  const reps = 4 + (weekIndex % 2);
  const steps = [{ type: "run", label: "Easy run", durationSeconds: 10 * 60, effort: "easy" }];
  for (let i = 0; i < reps; i++) {
    steps.push({
      type: "run",
      label: `Interval ${i + 1} — hard but controlled (RPE 8)`,
      durationSeconds: intervalRun,
      effort: "interval",
    });
    steps.push({ type: "walk", label: "Recovery walk or jog", durationSeconds: recover });
  }
  steps.push({ type: "run", label: "Easy cool jog", durationSeconds: 8 * 60, effort: "easy" });
  return steps;
}

function longRunSteps(distanceKm, isTaper) {
  const pace = isTaper ? EASY_PACE_MIN_PER_KM : LONG_PACE_MIN_PER_KM;
  const sec = kmToSeconds(distanceKm, pace);
  const effort = isTaper ? "easy — keep it conversational" : "easy — conversational (RPE 4–5)";
  return [
    {
      type: "run",
      label: `Long run · ${distanceKm.toFixed(1)} km target`,
      durationSeconds: sec,
      distanceKm,
      effort,
    },
  ];
}

function easyContinuousSteps(seconds) {
  return [
    {
      type: "run",
      label: "Easy run — conversational (RPE 4–5)",
      durationSeconds: seconds,
      effort: "easy",
    },
  ];
}

function sessionSummary(steps, units) {
  const main = steps.filter((s) => !s.label.startsWith("Warm-up") && !s.label.startsWith("Cool-down"));
  const dist = main.find((s) => s.distanceKm)?.distanceKm;
  if (dist) return `${formatDistance(dist, units)} · easy effort`;
  const runSec = main.filter((s) => s.type === "run").reduce((a, s) => a + s.durationSeconds, 0);
  const runMin = Math.round(runSec / 60);
  const effort = main.find((s) => s.effort)?.effort;
  if (effort?.includes("tempo")) return `~${runMin} min · tempo & easy`;
  if (effort === "interval") return `~${runMin} min · intervals`;
  return `~${runMin} min · easy`;
}

function weekTemplates(daysPerWeek) {
  if (daysPerWeek === 3) {
    return [
      { role: "easy", title: "Easy run" },
      { role: "workout", title: "Workout" },
      { role: "long", title: "Long run" },
    ];
  }
  return [
    { role: "easy", title: "Easy run" },
    { role: "easy", title: "Easy run" },
    { role: "workout", title: "Workout" },
    { role: "long", title: "Long run" },
  ];
}

export function parseDateOnly(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startDateFromRace(raceDateISO, weeks) {
  const race = parseDateOnly(raceDateISO);
  race.setDate(race.getDate() - weeks * 7);
  return formatDateISO(race);
}

export function generateHalfPlan({
  daysPerWeek,
  strengthLevel,
  preferredDays,
  startDateISO,
  name,
  strengthDaysPerWeek = 1,
  strengthPreferredDays,
  equipment = [],
  units = "mi",
  raceDateISO = "",
}) {
  const weeks = weeksForHalfPlan(strengthLevel);
  const longRuns = longRunProgressionKm(weeks);
  const templates = weekTemplates(daysPerWeek);
  const workouts = [];
  let sessionIndex = 0;

  const runDays = preferredDays.slice(0, daysPerWeek);
  let strengthDays = strengthPreferredDays?.length
    ? strengthPreferredDays.slice(0, strengthDaysPerWeek)
    : defaultStrengthDays(runDays, strengthDaysPerWeek);
  if (!strengthDaysValid(runDays, strengthDays)) {
    strengthDays = defaultStrengthDays(runDays, strengthDaysPerWeek);
  }

  const taperStart = weeks - 2;

  for (let w = 0; w < weeks; w++) {
    const phase = phaseForWeek(w, weeks);
    const isTaper = w >= taperStart;
    const longKm = longRuns[w];

    for (let d = 0; d < daysPerWeek; d++) {
      const tmpl = templates[d];
      let main;
      let title = `Week ${w + 1} · ${tmpl.title}`;
      if (tmpl.role === "long") {
        main = longRunSteps(longKm, isTaper);
        title = isTaper ? `Week ${w + 1} · Taper long run` : `Week ${w + 1} · Long run`;
      } else if (tmpl.role === "workout") {
        main = isTaper
          ? easyContinuousSteps(25 * 60)
          : buildWorkoutSteps(phase, w);
        title = isTaper ? `Week ${w + 1} · Easy shake-out` : `Week ${w + 1} · ${phase === "base" ? "Strides" : phase === "build" ? "Tempo" : "Intervals"}`;
      } else {
        main = easyContinuousSteps(easyRunSeconds(w, weeks));
      }
      const steps = withBookends(main);
      const weekday = preferredDays[d % preferredDays.length];
      workouts.push({
        id: `half-w${w}-d${d}`,
        kind: "run",
        weekIndex: w,
        dayInWeek: d,
        sessionIndex,
        weekday,
        title,
        summary: sessionSummary(steps, units),
        steps,
        runRole: tmpl.role,
        longRunKm: tmpl.role === "long" ? longKm : undefined,
        isRaceWeek: w === weeks - 1,
      });
      sessionIndex++;
    }
  }

  const last = workouts[workouts.length - 1];
  if (last) {
    last.title = "Half marathon — race day";
    last.summary = `${formatRaceDistance(units)} · trust your training`;
    last.isCelebration = true;
  }

  const strengthWorkouts = generateStrengthWorkouts({
    weeks,
    strengthDaysPerWeek,
    strengthPreferredDays: strengthDays,
    equipment,
    strengthLevel,
  });

  return {
    meta: {
      name: name || "",
      goal: "half",
      daysPerWeek,
      strengthLevel,
      level: strengthLevel,
      preferredDays: runDays,
      startDateISO,
      raceDateISO: raceDateISO || "",
      weeks,
      totalSessions: weeks * daysPerWeek,
      strengthDaysPerWeek,
      strengthPreferredDays: strengthDays,
      equipment,
      units,
      createdAt: new Date().toISOString(),
    },
    workouts,
    strengthWorkouts,
    longRunProgressionKm: longRuns,
  };
}

export function replanHalfFromWeek(state, fromWeekIndex) {
  const { meta, workouts, completed } = state;
  const kept = workouts.filter((w) => w.weekIndex < fromWeekIndex);
  const completedBefore = new Set(
    (completed || [])
      .filter((c) => {
        const w = workouts.find((x) => x.id === c.workoutId);
        return w && w.weekIndex < fromWeekIndex;
      })
      .map((c) => c.workoutId)
  );

  const fresh = generateHalfPlan({
    daysPerWeek: meta.daysPerWeek,
    strengthLevel: meta.strengthLevel || meta.level || "beginner",
    preferredDays: meta.preferredDays,
    startDateISO: meta.startDateISO,
    name: meta.name,
    strengthDaysPerWeek: meta.strengthDaysPerWeek ?? 1,
    strengthPreferredDays: meta.strengthPreferredDays,
    equipment: meta.equipment || [],
    units: meta.units || "mi",
    raceDateISO: meta.raceDateISO || "",
  });

  const newTail = fresh.workouts.filter((w) => w.weekIndex >= fromWeekIndex);
  const merged = [
    ...kept,
    ...newTail.map((w, i) => ({
      ...w,
      sessionIndex: kept.length + i,
    })),
  ];

  const keptStrength = (state.strengthWorkouts || []).filter((w) => w.weekIndex < fromWeekIndex);
  const newStrengthTail = fresh.strengthWorkouts.filter((w) => w.weekIndex >= fromWeekIndex);
  const strengthCompletedBefore = new Set(
    (state.strengthCompleted || [])
      .filter((c) => {
        const w = (state.strengthWorkouts || []).find((x) => x.id === c.workoutId);
        return w && w.weekIndex < fromWeekIndex;
      })
      .map((c) => c.workoutId)
  );

  return {
    ...state,
    meta: { ...fresh.meta, replannedFromWeek: fromWeekIndex },
    workouts: merged,
    strengthWorkouts: [...keptStrength, ...newStrengthTail],
    longRunProgressionKm: fresh.longRunProgressionKm,
    completed: (completed || []).filter((c) => completedBefore.has(c.workoutId)),
    strengthCompleted: (state.strengthCompleted || []).filter((c) =>
      strengthCompletedBefore.has(c.workoutId)
    ),
  };
}
