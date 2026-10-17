/**
 * Coach half-marathon plans (source: data/half-marathon-plan.json).
 */

import coach from "../data/half-marathon-plan.json" with { type: "json" };
import { defaultStrengthDays, strengthDaysValid } from "./strength.js";
import { generateCoachStrengthWorkouts, coachEquipmentSummary } from "./coachStrength.js";

const MI_TO_KM = 1.609344;

export const COACH_DISCLAIMER = coach.disclaimer;
export const COACH_EFFORT_GUIDE = coach.effort_guide;
export const COACH_PHASES = coach.phases;
export const COACH_PREREQUISITES = coach.prerequisites;

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RUN_TYPES = new Set(["workout", "strides", "easy", "recovery", "long", "race"]);

export function weeksForHalfPlan(runLevel) {
  return runLevel === "average" ? 12 : 16;
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

export function strengthLevelFromPushUps(count) {
  const n = Number(count);
  if (Number.isNaN(n) || n < 0) return "beginner";
  return n >= 8 ? "average" : "beginner";
}

/** Running-base + push-ups → run plan level and strength level. */
export function resolveHalfPlacement(pushups, runningBase) {
  const strengthLevel = strengthLevelFromPushUps(pushups);
  if (!runningBase?.can30RunWalk) {
    return { ok: false, strengthLevel, runLevel: "beginner", reason: "5k-first" };
  }
  const avgBase =
    runningBase.threePerWeek4Weeks && runningBase.recent4Mi && runningBase.continuous30_40;
  const runLevel = pushups >= 8 && avgBase ? "average" : "beginner";
  return { ok: true, strengthLevel, runLevel };
}

export function getCoachPlanVariant(runLevel, daysPerWeek) {
  const id = `${runLevel}-${daysPerWeek}day`;
  return coach.plans.find((p) => p.id === id) || null;
}

export function longRunProgressionKm(runLevel, daysPerWeek = 3) {
  if (typeof runLevel === "number") {
    const rl = runLevel === 12 ? "average" : "beginner";
    return longRunProgressionKm(rl, daysPerWeek);
  }
  const plan = getCoachPlanVariant(runLevel, daysPerWeek);
  return plan ? plan.weeks.map((w) => w.long_run_km) : [];
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

function parseMinutes(text) {
  if (!text) return 0;
  const m = String(text).match(/(\d+)\s*min/i);
  return m ? Number(m[1]) : 0;
}

function stepsFromRunSession(sess, planVariant, units) {
  const steps = [];
  const pace = planVariant.assumed_long_run_pace_min_per_mi || 12;
  const effort = `RPE ${sess.effort_rpe || "3-4"}`;
  const talk = sess.talk_test || "";

  const wuMin = sess.warmup_min ?? parseMinutes(sess.warmup) ?? 5;
  if (wuMin > 0) {
    steps.push({
      type: "walk",
      label: typeof sess.warmup === "string" ? sess.warmup : "Warm-up",
      durationSeconds: wuMin * 60,
      effort,
      talkTest: talk,
    });
  }

  if (sess.type === "long" || sess.type === "race") {
    const km = sess.distance_km ?? milesToKm(sess.distance_mi || 0);
    const sec = Math.round(km * (pace / MI_TO_KM) * 60);
    steps.push({
      type: "run",
      label:
        sess.type === "race"
          ? `Race · ${formatRaceDistance(units)}`
          : `Long run · ${formatDistance(km, units)}`,
      durationSeconds: sec,
      distanceKm: km,
      effort,
      talkTest: talk,
    });
  } else {
    const mainMin =
      sess.main_min ??
      Math.max(5, (sess.duration_min || 30) - wuMin - (sess.cooldown_min ?? parseMinutes(sess.cooldown) ?? 5));
    const mainLabel = sess.name
      ? `${sess.name}: ${sess.main || ""}`
      : sess.main || sess.type;
    steps.push({
      type: sess.type === "workout" || sess.type === "strides" ? "run" : "run",
      label: mainLabel.trim(),
      durationSeconds: mainMin * 60,
      effort,
      talkTest: talk,
    });
  }

  const cdMin = sess.cooldown_min ?? parseMinutes(sess.cooldown) ?? 5;
  if (cdMin > 0) {
    steps.push({
      type: "walk",
      label: typeof sess.cooldown === "string" ? sess.cooldown : "Cool-down",
      durationSeconds: cdMin * 60,
      effort: "3-4",
      talkTest: "Full sentences",
    });
  }
  return steps;
}

function runSessionsForWeek(weekData, daysPerWeek) {
  const runs = weekData.sessions.filter((s) => RUN_TYPES.has(s.type));
  if (daysPerWeek === 3) return runs.filter((s) => s.type !== "recovery");
  return runs;
}

function sessionTitle(sess, weekNum) {
  if (sess.type === "race") return "Half marathon — race day";
  if (sess.type === "long") return `Week ${weekNum} · Long run`;
  if (sess.type === "workout" || sess.type === "strides") {
    return `Week ${weekNum} · ${sess.name || "Workout"}`;
  }
  if (sess.type === "recovery") return `Week ${weekNum} · Recovery run`;
  return `Week ${weekNum} · Easy run`;
}

function sessionSummary(sess, units) {
  if (sess.type === "long" || sess.type === "race") {
    const km = sess.distance_km ?? milesToKm(sess.distance_mi);
    return `${formatDistance(km, units)} · RPE ${sess.effort_rpe} · ${sess.talk_test}`;
  }
  return `${sess.duration_min || ""} min · RPE ${sess.effort_rpe} · ${sess.talk_test}`;
}

export function mapEquipmentToCoach(appEquipment = []) {
  const set = new Set(appEquipment);
  if (set.has("kettlebells_essentials")) return ["kettlebells_essentials"];
  if (set.has("kettlebell") || (set.has("bench") && set.has("bands"))) return ["kettlebells_essentials"];
  if (set.has("dumbbells")) return ["dumbbells"];
  return ["none"];
}

export function generateHalfPlan({
  daysPerWeek,
  runLevel = "beginner",
  strengthLevel = "beginner",
  preferredDays,
  startDateISO,
  name,
  strengthPreferredDays,
  equipment = ["none"],
  units = "mi",
  raceDateISO = "",
  pushups = 5,
  runningBase = null,
}) {
  const planVariant = getCoachPlanVariant(runLevel, daysPerWeek);
  if (!planVariant) throw new Error("Unknown half plan variant");

  const weeks = planVariant.weeks_total;
  const longRuns = planVariant.weeks.map((w) => w.long_run_km);
  const runDays = preferredDays.slice(0, daysPerWeek);
  const coachEq = mapEquipmentToCoach(equipment);

  let strengthDays = strengthPreferredDays?.length
    ? strengthPreferredDays.slice(0, 2)
    : defaultStrengthDays(runDays, 2);
  if (!strengthDaysValid(runDays, strengthDays)) {
    strengthDays = defaultStrengthDays(runDays, 2);
  }

  const workouts = [];
  let sessionIndex = 0;

  for (let w = 0; w < weeks; w++) {
    const weekData = planVariant.weeks[w];
    const runs = runSessionsForWeek(weekData, daysPerWeek);
    for (let d = 0; d < runs.length; d++) {
      const sess = runs[d];
      const steps = stepsFromRunSession(sess, planVariant, units);
      workouts.push({
        id: `half-w${w}-d${d}`,
        kind: "run",
        weekIndex: w,
        dayInWeek: d,
        sessionIndex,
        weekday: runDays[d % runDays.length],
        title: sessionTitle(sess, w + 1),
        summary: sessionSummary(sess, units),
        steps,
        runRole: sess.type,
        longRunKm: sess.type === "long" || sess.type === "race" ? sess.distance_km : undefined,
        phase: weekData.phase,
        coachWeek: weekData.week,
        isCelebration: sess.type === "race",
        isRaceWeek: w === weeks - 1,
      });
      sessionIndex++;
    }
  }

  const strengthWorkouts = generateCoachStrengthWorkouts({
    planWeeks: planVariant.weeks,
    strengthPreferredDays: strengthDays,
    strengthLevel,
    equipment: coachEq,
    pushups,
  });

  const maxStrengthSlots = Math.max(1, ...planVariant.weeks.map((wk) => (wk.strength?.includes("B") ? 2 : 1)));

  return {
    meta: {
      name: name || "",
      goal: "half",
      daysPerWeek,
      runLevel,
      strengthLevel,
      level: runLevel,
      preferredDays: runDays,
      startDateISO,
      raceDateISO: raceDateISO || "",
      weeks,
      totalSessions: workouts.length,
      strengthDaysPerWeek: maxStrengthSlots,
      strengthPreferredDays: strengthDays.slice(0, 2),
      equipment: coachEq,
      units,
      pushups: Number(pushups) || 0,
      runningBase,
      coachPlanId: planVariant.id,
      createdAt: new Date().toISOString(),
    },
    workouts,
    strengthWorkouts,
    longRunProgressionKm: longRuns,
    coachMeta: {
      disclaimer: COACH_DISCLAIMER,
      effortGuide: COACH_EFFORT_GUIDE,
      phases: COACH_PHASES,
    },
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
    runLevel: meta.runLevel || meta.level || "beginner",
    strengthLevel: meta.strengthLevel || "beginner",
    preferredDays: meta.preferredDays,
    startDateISO: meta.startDateISO,
    name: meta.name,
    strengthPreferredDays: meta.strengthPreferredDays,
    equipment: meta.equipment || ["none"],
    units: meta.units || "mi",
    raceDateISO: meta.raceDateISO || "",
    pushups: meta.pushups ?? 5,
    runningBase: meta.runningBase,
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

  return {
    ...state,
    meta: { ...fresh.meta, replannedFromWeek: fromWeekIndex },
    workouts: merged,
    strengthWorkouts: [...keptStrength, ...newStrengthTail],
    longRunProgressionKm: fresh.longRunProgressionKm,
    coachMeta: fresh.coachMeta,
    completed: (completed || []).filter((c) => completedBefore.has(c.workoutId)),
    strengthCompleted: (state.strengthCompleted || []).filter((c) => {
      const w = (state.strengthWorkouts || []).find((x) => x.id === c.workoutId);
      return w && w.weekIndex < fromWeekIndex;
    }),
  };
}

export { coachEquipmentSummary };
