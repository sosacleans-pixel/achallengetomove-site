/**
 * Coach half-marathon strength sessions (from half-marathon-plan.json).
 */

import coach from "../data/half-marathon-plan.json" with { type: "json" };

const REST_SEC = 45;

function normalizeEquipment(equipment) {
  if (equipment?.kit) return equipment;
  const kit = Array.isArray(equipment) ? equipment[0] || "none" : equipment || "none";
  return { kit, optional: [] };
}

function equipmentTier(equipment) {
  const { kit } = normalizeEquipment(equipment);
  if (kit === "kettlebells_and_essentials") return "kettlebell";
  if (kit === "dumbbells") return "dumbbell";
  return "bodyweight";
}

function pushupExercise(pushups, strengthLevel) {
  const table = coach.strength.pushup_progression;
  const score = Number(pushups) || 0;
  let row = table[0];
  for (const r of table) {
    const range = r.score;
    if (range.includes("+") && score >= Number(range.replace("+", ""))) row = r;
    else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      if (score >= a && score <= b) row = r;
    }
  }
  if (strengthLevel === "beginner" && score >= 8) {
    row = table.find((r) => r.level === "Average" && r.score.startsWith("8")) || row;
  }
  return row;
}

function phaseKey(phaseName) {
  const p = (phaseName || "Base").toLowerCase();
  if (p.includes("taper")) return "Taper";
  if (p.includes("peak")) return "Peak (maintain)";
  if (p.includes("build")) return "Build";
  return "Base";
}

function dosing(phaseName, strengthLevel) {
  const key = phaseKey(phaseName);
  const row = coach.strength.phase_dosing.find((d) => d.phase === key || d.phase.startsWith(key.split(" ")[0]));
  if (!row) return { sets: 2, reps: 10, rpe: "5-6" };
  const text = strengthLevel === "average" ? row.average : row.beginner;
  const setsMatch = text.match(/(\d+)(?:-\d+)? sets/i);
  const repsMatch = text.match(/x (\d+)(?:-(\d+))? reps/i);
  return {
    sets: setsMatch ? Number(setsMatch[1]) : 2,
    reps: repsMatch ? Number(repsMatch[1]) : 10,
    rpe: text.match(/RPE ([\d-]+)/i)?.[1] || "6",
    note: text,
  };
}

function movementFor(pattern, session, tier, optional = []) {
  const m = coach.strength.movements.find((x) => x.pattern === pattern || x.pattern.startsWith(pattern.split(" ")[0]));
  if (!m) return { label: pattern, cue: "" };
  const key = tier === "kettlebell" ? "kettlebell" : tier === "dumbbell" ? "dumbbell" : "bodyweight";
  let cue = m[key] || m.bodyweight;
  const opt = new Set(optional);
  if (m.optional) {
    if (opt.has("trx") && m.optional.includes("Suspension")) cue = `${cue} Optional: ${m.optional}`;
    else if (opt.has("pullup_bar") && m.optional.includes("pull-up")) cue = `${cue} Optional: ${m.optional}`;
    else if (opt.has("foam_roller") && pattern.includes("Hip")) cue = cue;
  }
  return { label: m.pattern, cue, easier: m.beginner, harder: m.average };
}

function parseStrengthSlots(strengthLabel) {
  if (!strengthLabel || /^None/i.test(strengthLabel)) return [];
  if (/A only/i.test(strengthLabel)) return ["A"];
  const slots = [];
  if (strengthLabel.includes("A")) slots.push("A");
  if (/\bB\b/.test(strengthLabel)) slots.push("B");
  return [...new Set(slots)];
}

function buildSessionSteps(sessionType, weekPhase, options) {
  const { strengthLevel, equipment, pushups } = options;
  const eq = normalizeEquipment(equipment);
  const tier = equipmentTier(eq);
  const optional = eq.optional || [];
  const dose = dosing(weekPhase, strengthLevel);
  const push = pushupExercise(pushups, strengthLevel);
  const steps = [];
  steps.push({
    mode: "timed",
    label: "Coach warm-up",
    description: coach.strength.sessions.warmup,
    durationSeconds: 5 * 60,
    voiceCue: "Strength warm-up.",
  });

  const patterns =
    sessionType === "A"
      ? ["Squat", "Row / pull", "Hinge", "Push (tied to the push-up test)", "Calf / foot", "Core anti-rotation"]
      : ["Lunge / split squat", "Push (tied to the push-up test)", "Row / pull", "Hip stability - glute bridge", "Hip stability - side plank", "Calf / foot"];

  for (let set = 1; set <= dose.sets; set++) {
    for (const pat of patterns) {
      if (pat.includes("Push")) {
        steps.push({
          mode: "reps",
          label: push.exercise,
          description: `${push.notes} · RPE ${dose.rpe}`,
          reps: Math.max(6, Math.round(dose.reps * 0.8)),
          round: set,
          voiceCue: `Push: ${push.exercise}`,
        });
      } else {
        const mv = movementFor(pat, sessionType, tier, optional);
        steps.push({
          mode: "reps",
          label: mv.label,
          description: `${mv.cue} · RPE ${dose.rpe}`,
          easier: mv.easier,
          harder: mv.harder,
          reps: dose.reps,
          round: set,
          voiceCue: `Next: ${mv.label}`,
        });
      }
      steps.push({ mode: "rest", label: "Rest", durationSeconds: REST_SEC, round: set, voiceCue: "Rest." });
    }
  }

  steps.push({
    mode: "timed",
    label: "Cool-down stretch",
    description: "Easy breathing and light stretching.",
    durationSeconds: 2 * 60,
    voiceCue: "Cool down.",
  });
  return steps;
}

export function generateCoachStrengthWorkouts({
  planWeeks,
  strengthPreferredDays,
  strengthLevel,
  equipment,
  pushups,
}) {
  const workouts = [];
  for (let w = 0; w < planWeeks.length; w++) {
    const week = planWeeks[w];
    const slots = parseStrengthSlots(week.strength);
    for (let s = 0; s < slots.length; s++) {
      const sessionType = slots[s];
      const steps = buildSessionSteps(sessionType, week.phase, { strengthLevel, equipment, pushups });
      workouts.push({
        id: `coach-strength-w${w}-${sessionType}`,
        kind: "strength",
        weekIndex: w,
        strengthSlot: s,
        sessionType,
        weekday: strengthPreferredDays[s] ?? strengthPreferredDays[0],
        title: `Strength ${sessionType} · coach plan`,
        summary: `${week.phase} · ${week.strength}`,
        phase: week.phase.toLowerCase().replace(/\s+.*/, ""),
        equipment,
        strengthLevel,
        coach: true,
        steps,
      });
    }
  }
  return workouts;
}

export function coachEquipmentSummary(equipment) {
  const map = {
    none: "Bodyweight",
    dumbbells: "Dumbbells",
    kettlebells_and_essentials: "Kettlebells + essentials kit",
  };
  const optMap = {
    foam_roller: "foam roller",
    pullup_bar: "pull-up bar",
    trx: "TRX / suspension straps",
  };
  const eq = normalizeEquipment(equipment);
  let label = map[eq.kit] || eq.kit;
  if (eq.kit === "kettlebells_and_essentials") {
    label += " (mini-band, long band, step/bench, mat)";
  }
  if (eq.optional?.length) {
    label += ` · Optional: ${eq.optional.map((o) => optMap[o] || o).join(", ")}`;
  }
  return label;
}
