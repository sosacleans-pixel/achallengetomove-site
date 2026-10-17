export const SUGGESTED_WORKOUTS = [
  { id: "walk-30", label: "Brisk walk", minutes: 30, kind: "walk", outdoor: true },
  { id: "walk-45", label: "Power walk", minutes: 45, kind: "walk", outdoor: true },
  { id: "run-easy", label: "Easy jog / run-walk", minutes: 30, kind: "run", outdoor: true },
  { id: "bw-full", label: "Full-body bodyweight circuit", minutes: 45, kind: "strength", outdoor: false },
  { id: "bw-upper", label: "Upper body bodyweight", minutes: 30, kind: "strength", outdoor: false },
  { id: "bw-lower", label: "Lower body bodyweight", minutes: 30, kind: "strength", outdoor: false },
  { id: "stretch", label: "Stretching & mobility", minutes: 20, kind: "recovery", outdoor: false },
  { id: "recovery-walk", label: "Easy recovery walk", minutes: 20, kind: "recovery", outdoor: true },
];

export const SEVEN_MIN_APP_URL = "https://app.coachsalimheyaime.com/";

export function workoutOptionsHtml(selectedId = "") {
  return SUGGESTED_WORKOUTS.map(
    (w) =>
      `<option value="${w.id}" ${w.id === selectedId ? "selected" : ""}>${w.label} (${w.minutes} min)</option>`
  ).join("");
}

export function findWorkout(id) {
  return SUGGESTED_WORKOUTS.find((w) => w.id === id) || null;
}
