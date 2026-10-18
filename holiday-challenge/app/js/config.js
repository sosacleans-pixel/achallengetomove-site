// App configuration. Change behaviour here, not in app.js.
export const CONFIG = {
  // Day 1 and Day 30 (local dates, YYYY-MM-DD). Day boundary = user's local midnight.
  start: "2026-11-25",
  end: "2026-12-24",
  // Late joiners: when true, someone who first opens the app after Day 1 can start that day
  // and sees the remaining days. Days before they joined are shown as "before you joined", never "missed".
  // DECISION NEEDED (Salim): keep on or turn off.
  lateJoin: true,
  // Finisher target for late joiners: "fixed" = always 22 complete days (book rule);
  // "proportional" = 22/30 of the days left when they joined (rounded up).
  // DECISION NEEDED (Salim). The program file only defines 22-in-30 for a Day 1 start.
  lateJoinTarget: "proportional",
  // Book rule: 22 complete days in the 30-day window (holiday-30-day-challenge.md, Grace rule).
  requiredDays: 22,
  // Protected days (Stop & Log, illness, travel...) extend the window one day each, up to this date.
  extendUntil: "2026-12-31",
  // Back-log yesterday until this local hour (12 = 11:59 AM).
  backlogUntilHour: 12,
  // Weekly check-in days and book tie-in days.
  checkinDays: [7, 14, 21, 28, 30],
  bookTieInDays: [1, 15, 30],
  testDays: [1, 30],
  optionalCheckDay: 15,
  storageKey: "holiday-30-v1",
  // Allow ?date=YYYY-MM-DD (or ?now=YYYY-MM-DDTHH:MM) to override the clock for testing.
  // Off for everyone who visits. The automated tests (tests/verify.mjs) turn it on only inside their own
  // browser by intercepting this file and serving it with `true`; nothing in the shipped app can switch it on.
  allowDateOverride: false,
  // Contact shown in legal screens (already public on achallengetomove.com/privacy/).
  contactEmail: "coachsalimheyaime@gmail.com",
  business: "Coach Salim Heyaime LLC",
};
