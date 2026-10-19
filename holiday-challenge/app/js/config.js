// App configuration. Change behaviour here, not in app.js.
export const CONFIG = {
  // ROLLING START (DECIDED, Salim, Oct 18 2026, 6:14 PM MT: "Day 1 opens when client buys it").
  // There is no shared calendar. Every user runs their own 30 days:
  //   Day 1  = the user's start date (state.startDate): the local calendar date on which they finish the welcome
  //            setup, which happens on their first visit with access (after purchase, or after redeeming a gift code;
  //            once email sign-in ships, setup only opens after that first sign-in). It is set once and never moves.
  //   Day N  = start date + (N - 1) calendar days, unlocking at local midnight in the user's own time zone
  //            (all date math uses local dates, see dates.js).
  //   Day 30 = the last day. A buyer on the last sale day (Dec 5, 2026) who starts the same day finishes on Jan 3, 2027.
  // Why setup and not the purchase timestamp: a buyer who opens the app a few days after paying, or a gift recipient,
  // never starts on a day that is already gone, and nothing about progress has to leave the device (progress stays
  // on-device per the privacy and CHD policies). The server access record (entitlements.starts_at, UTC) still decides
  // whether the user has access and when the 12-month Access Period ends; it does not decide the challenge days.
  programDays: 30,
  // Protected days (Stop & Log, illness, travel...): each adds one make-up day after Day 30, up to this many.
  extendDays: 7,
  // Book rule: 22 complete days in the 30-day window (holiday-30-day-challenge.md, Grace rule).
  requiredDays: 22,
  // Back-log yesterday until this local hour (12 = 11:59 AM).
  backlogUntilHour: 12,
  // Weekly check-in days and book tie-in days.
  checkinDays: [7, 14, 21, 28, 30],
  bookTieInDays: [1, 15, 30],
  testDays: [1, 30],
  optionalCheckDay: 15,
  storageKey: "holiday-30-v1",
  // Language: "en" or "es". Default = the browser language when it is Spanish, else English.
  // The choice (EN/ES switch on the welcome screen and in More > Settings) is stored on this device only.
  languages: ["en", "es"],
  langKey: "holiday-30-lang",
  // Allow ?date=YYYY-MM-DD (or ?now=YYYY-MM-DDTHH:MM) to override the clock for testing.
  // Off for everyone who visits. The automated tests (tests/verify.mjs) turn it on only inside their own
  // browser by intercepting this file and serving it with `true`; nothing in the shipped app can switch it on.
  allowDateOverride: false,
  // Contact shown in legal screens (already public on achallengetomove.com/privacy/).
  contactEmail: "coachsalimheyaime@gmail.com",
  business: "Coach Salim Heyaime LLC",
  // Site page linked from the app's Privacy screen (same origin as the app).
  consumerHealthPolicyUrl: "/privacy/consumer-health-data/",
  // No prices are shown anywhere in the app (checkout shows the price). No pixels, analytics or geofencing.
};
