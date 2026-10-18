// App configuration. Change behaviour here, not in app.js.
export const CONFIG = {
  // Day 1 and Day 30 (local dates, YYYY-MM-DD). Day boundary = user's local midnight.
  start: "2026-11-25",
  end: "2026-12-24",
  // Late joiners (DECIDED, Salim, Oct 18 2026): someone who first opens the app after Day 1 and before Dec 24
  // can start that day and sees the remaining days. Days before they joined are shown as "before you joined", never "missed".
  lateJoin: true,
  // Finisher goal for late joiners (DECIDED): "proportional" = ceil(22/30 x days remaining, counting the join day).
  // Example: joining on Day 16 leaves 15 days, so the goal is ceil(22 * 15 / 30) = 11. A Day 1 start keeps 22 of 30.
  // ("fixed" would always require 22.)
  lateJoinTarget: "proportional",
  // Self-paced edition (DECIDED, Salim, Oct 18 2026). Anyone who first opens the app after `after`, or who picks
  // "self-paced" on the welcome screen, starts Day 1 on their own start date and runs `days` days from there,
  // with no fixed calendar. Live-challenge users who are past Dec 24 see their completion summary first, then get
  // the option to keep going self-paced (their live results are kept in history).
  selfPaced: {
    enabled: true,
    after: "2026-12-24", // first open after this local date = self-paced only
    days: 30,
    offerChoice: true, // show "start self-paced" on the welcome screen before and during the live window
    extendDays: 7, // protected days extend a self-paced window one day each, up to this many days
  },
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
  consumerHealthPolicyUrl: "/privacy/#consumer-health-data",
  // No prices are shown anywhere in the app (checkout shows the price). No pixels, analytics or geofencing.
};
