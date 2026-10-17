/** Original copy — daily rules for onboarding (do not name other programs). */

export function programIntro(mode) {
  if (mode === "adaptive") {
    return {
      title: "75 Adaptive",
      body: `Seventy-five days to build strength, clarity, and consistency — on a schedule you can sustain. You will train most days, fuel your body with mostly whole foods, hydrate, learn daily, and check in with yourself. There is no restart: missed tasks are logged, and you keep moving forward.`,
    };
  }
  return {
    title: "75 All-In",
    body: `Seventy-five consecutive days of discipline: movement, nutrition, hydration, learning, sleep, and honest daily proof. Every task counts every day. If you miss any required task, you begin again at Day 1 — with your best streak and past attempts saved so you can see how far you have come.`,
  };
}

export function dailyRules(mode) {
  if (mode === "adaptive") {
    return [
      "One workout at your chosen length on training days; active recovery (walk or stretching) on recovery days — default is daily 45-minute training with one recovery day per week.",
      "Balanced eating, aiming for mostly whole foods, with one flexible meal allowed each week.",
      "Limit alcohol — track drinks; aim for none on weekdays; only at social occasions when you choose.",
      "Water target based on your body weight (default about 3 liters).",
      "Ten minutes of reading, learning, or mindfulness.",
      "Daily check-in: energy, mood, and a short note.",
    ];
  }
  return [
    "Two workouts of at least 45 minutes, at least 3 hours apart — only one is normally outdoors (bad-weather exception available on the workout screen).",
    "Follow a structured whole-food eating plan with no off-plan meals.",
    "No alcohol.",
    "Drink your water target (default about 3.7 L / 1 gallon, adjustable).",
    "Ten pages of non-fiction or personal-growth reading, or 15 minutes of learning.",
    "A daily progress photo stored on this device only.",
    "Seven or more hours of sleep the night before.",
  ];
}

export const PREP_ITEMS = [
  { id: "meals", label: "Plan meals and groceries for Week 1" },
  { id: "water", label: "Fill a water bottle and set your daily target" },
  { id: "book", label: "Pick a book or course for daily reading" },
  { id: "schedule", label: "Schedule workouts in your calendar" },
];

export const KEEP_GOING_HABITS = [
  { id: "cold", label: "5-minute cold shower" },
  { id: "viz", label: "10-minute visualization or journaling" },
  { id: "focus", label: "1 hour of focused work on a personal goal" },
  { id: "kindness", label: "1 intentional act of kindness" },
];

export const MILESTONE_DAYS = [7, 25, 50, 75];
