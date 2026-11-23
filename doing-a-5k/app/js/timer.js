/**
 * Timestamp-based workout timer (accurate when tab is backgrounded).
 */

export class WorkoutTimer {
  constructor({ steps, onTick, onStepChange, onComplete, onCue }) {
    this.steps = steps;
    this.onTick = onTick;
    this.onStepChange = onStepChange;
    this.onComplete = onComplete;
    this.onCue = onCue;
    this.stepIndex = 0;
    this.stepStartedAt = null;
    this.pausedAt = null;
    this.accumulatedPauseMs = 0;
    this.running = false;
    this._interval = null;
    this._wakeLock = null;
    this.totalSeconds = steps.reduce((a, s) => a + s.durationSeconds, 0);
    this._spokenSteps = new Set();
    /* Ladder additions (preview): actual time spent per step, and the result of an open
       (count-up) step such as the 5k-open or 10k-open step. Fixed steps behave exactly as before. */
    this.stepElapsedMs = [];
    this.openResult = null;
  }

  static isOpenStep(step) {
    return !!step && (step.type === "5k-open" || step.type === "10k-open" || step.open === true);
  }

  /* Count-up steps only: the user taps Finish (or Stop). Saves the time, then moves on. */
  finishOpen() {
    const step = this.steps[this.stepIndex];
    if (!WorkoutTimer.isOpenStep(step)) return;
    const secs = Math.floor(this.getStepElapsedMs() / 1000);
    this.openResult = { stepIndex: this.stepIndex, seconds: secs, capped: false };
    this._finishStep();
  }

  async start() {
    this.running = true;
    this.stepStartedAt = Date.now();
    this.accumulatedPauseMs = 0;
    this._interval = setInterval(() => this._tick(), 250);
    this._cue("start");
    await this._requestWakeLock();
    this._tick();
  }

  pause() {
    if (!this.running || this.pausedAt) return;
    this.pausedAt = Date.now();
    this.running = false;
    clearInterval(this._interval);
    this._releaseWakeLock();
  }

  resume() {
    if (!this.pausedAt) return;
    this.accumulatedPauseMs += Date.now() - this.pausedAt;
    this.pausedAt = null;
    this.running = true;
    this._interval = setInterval(() => this._tick(), 250);
    this._requestWakeLock();
  }

  skipStep() {
    this._finishStep();
  }

  stop() {
    this.running = false;
    clearInterval(this._interval);
    this._releaseWakeLock();
  }

  getStepElapsedMs() {
    if (!this.stepStartedAt) return 0;
    const now = this.pausedAt ?? Date.now();
    return now - this.stepStartedAt - this.accumulatedPauseMs;
  }

  getOverallElapsedMs() {
    let ms = 0;
    for (let i = 0; i < this.stepIndex; i++) {
      ms += this.steps[i].durationSeconds * 1000;
    }
    ms += this.getStepElapsedMs();
    return ms;
  }

  _tick() {
    if (!this.running) return;
    const step = this.steps[this.stepIndex];
    if (!step) return;
    const elapsed = this.getStepElapsedMs();
    const remaining = step.durationSeconds * 1000 - elapsed;
    if (WorkoutTimer.isOpenStep(step)) {
      /* Count-up step: durationSeconds is the cap (config.js: 45:00 for 5k-open, 90:00 for 10k-open). Auto-stop at the cap. */
      if (remaining <= 0) {
        this.openResult = { stepIndex: this.stepIndex, seconds: step.durationSeconds, capped: true };
        this._finishStep();
        return;
      }
      this.onTick({
        stepIndex: this.stepIndex,
        step,
        open: true,
        elapsedSeconds: Math.floor(elapsed / 1000),
        remainingSeconds: Math.ceil(remaining / 1000),
        overallProgress: Math.min(1, this.getOverallElapsedMs() / (this.totalSeconds * 1000)),
      });
      return;
    }
    const half = step.durationSeconds * 500;
    if (!this._spokenSteps.has(`half-${this.stepIndex}`) && elapsed >= half) {
      this._spokenSteps.add(`half-${this.stepIndex}`);
      this._cue("halfway");
    }
    if (remaining <= 0) {
      this._finishStep();
      return;
    }
    this.onTick({
      stepIndex: this.stepIndex,
      step,
      remainingSeconds: Math.ceil(remaining / 1000),
      overallProgress: Math.min(1, this.getOverallElapsedMs() / (this.totalSeconds * 1000)),
    });
  }

  _finishStep() {
    const prev = this.stepIndex;
    this.stepElapsedMs[prev] = Math.max(0, this.getStepElapsedMs());
    this.stepIndex++;
    this.stepStartedAt = Date.now();
    this.accumulatedPauseMs = 0;
    this._beep();
    if (this.stepIndex >= this.steps.length) {
      this.stop();
      this._cue("complete");
      this.onComplete?.();
      return;
    }
    this.onStepChange?.(this.stepIndex, this.steps[this.stepIndex]);
    this._cueStep(this.steps[this.stepIndex]);
    this._tick();
  }

  _cue(kind) {
    this.onCue?.(kind);
  }

  _cueStep(step) {
    if (step.cue) return this._cue(step.cue);
    if (step.type === "run") this._cue("run");
    else if (step.label.includes("Cool")) this._cue("cooldown");
    else this._cue("walk");
  }

  _beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 120);
    } catch {
      /* audio optional */
    }
    if (navigator.vibrate) navigator.vibrate(80);
  }

  async _requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      /* ignore */
    }
  }

  _releaseWakeLock() {
    this._wakeLock?.release?.();
    this._wakeLock = null;
  }
}

export const SPEECH_CUES = {
  start: "Let's begin. Warm up with an easy walk.",
  run: "Start running.",
  walk: "Walk now.",
  cooldown: "Cool down with an easy walk.",
  halfway: "Halfway.",
  complete: "Workout complete. Great job.",
};
