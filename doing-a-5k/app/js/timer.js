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
