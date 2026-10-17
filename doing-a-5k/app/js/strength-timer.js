/**
 * Timestamp-based strength timer (timed steps, rest, rep-based with Done).
 */

export class StrengthTimer {
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
    this.totalWeight = steps.reduce((a, s) => a + this._stepWeight(s), 0);
    this._spokenSteps = new Set();
  }

  _stepWeight(step) {
    if (step.mode === "reps") return (step.reps || 10) * 3;
    return step.durationSeconds || 30;
  }

  async start() {
    this.running = true;
    this.stepStartedAt = Date.now();
    this.accumulatedPauseMs = 0;
    this._interval = setInterval(() => this._tick(), 250);
    this._cueStep(this.steps[0]);
    await this._requestWakeLock();
    this._emit();
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
    this._emit();
  }

  skipStep() {
    this._advance();
  }

  completeRepStep() {
    const step = this.steps[this.stepIndex];
    if (step?.mode === "reps") this._advance();
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

  getWeightedElapsed() {
    let w = 0;
    for (let i = 0; i < this.stepIndex; i++) w += this._stepWeight(this.steps[i]);
    const step = this.steps[this.stepIndex];
    if (step?.mode === "reps") {
      w += this._stepWeight(step) * 0.5;
    } else {
      w += Math.min(this._stepWeight(step), this.getStepElapsedMs() / 1000);
    }
    return w;
  }

  _tick() {
    if (!this.running) return;
    const step = this.steps[this.stepIndex];
    if (!step || step.mode === "reps") return;
    const elapsed = this.getStepElapsedMs();
    const remaining = step.durationSeconds * 1000 - elapsed;
    const half = step.durationSeconds * 500;
    if (!this._spokenSteps.has(`half-${this.stepIndex}`) && elapsed >= half && step.durationSeconds >= 20) {
      this._spokenSteps.add(`half-${this.stepIndex}`);
      this.onCue?.("halfway");
    }
    if (remaining <= 0) {
      this._advance();
      return;
    }
    this._emit(remaining);
  }

  _emit(remainingMs) {
    const step = this.steps[this.stepIndex];
    const remainingSeconds =
      step.mode === "reps"
        ? null
        : Math.ceil((remainingMs ?? step.durationSeconds * 1000 - this.getStepElapsedMs()) / 1000);
    this.onTick({
      stepIndex: this.stepIndex,
      step,
      remainingSeconds,
      overallProgress: Math.min(1, this.getWeightedElapsed() / this.totalWeight),
    });
  }

  _advance() {
    this.stepIndex++;
    this.stepStartedAt = Date.now();
    this.accumulatedPauseMs = 0;
    this._beep();
    if (this.stepIndex >= this.steps.length) {
      this.stop();
      this.onCue?.("complete");
      this.onComplete?.();
      return;
    }
    this.onStepChange?.(this.stepIndex, this.steps[this.stepIndex]);
    this._cueStep(this.steps[this.stepIndex]);
    this._emit();
    if (this.steps[this.stepIndex].mode !== "reps") {
      this.running = true;
      if (!this._interval) this._interval = setInterval(() => this._tick(), 250);
    }
  }

  _cueStep(step) {
    if (step?.voiceCue) this.onCue?.("custom", step.voiceCue);
  }

  _beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 660;
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 100);
    } catch {
      /* optional */
    }
    if (navigator.vibrate) navigator.vibrate(60);
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
