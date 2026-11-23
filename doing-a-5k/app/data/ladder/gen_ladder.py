#!/usr/bin/env python3
"""Builds the 3 Doing a 5K ladder level files (30 slots each) from Coach Fit's final spec
(doing-a-5k-ladder-coachfit.md v3, Nov 22, 2026). Run: python3 gen_ladder.py
Preview only. Level names are working names pending the Attorney's check."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

def t(s):
    """'m:ss' -> seconds"""
    m, s2 = s.split(":")
    return int(m) * 60 + int(s2)

def step(type_, label, dur, effort="", cue=None, phase="main"):
    d = {"type": type_, "label": label, "durationSeconds": dur, "phase": phase}
    if effort: d["effort"] = effort
    if cue: d["cue"] = cue
    return d

RPE_WALK = "Brisk, RPE 3"
RPE_JOG = "RPE 4, full sentences"
RPE_EASY = "Easy, RPE 3 to 4, full sentences"
RPE_STRIDE = "Quick and smooth, RPE 7, not a sprint"
RPE_BRISK = "Brisk, RPE 6 to 7, short phrases"
RPE_STEADY = "Steady, RPE 6, short phrases"
RPE_TEMPO = "Tempo, RPE 6 to 7, short phrases"
RPE_CRUISE = "Cruise, RPE 7, short phrases"
RPE_UP = "Uphill, RPE 7 to 8, a few words at the top"

def warm_walk():
    return [step("walk", "Warm-up brisk walk", 300, RPE_WALK, phase="warmup")]

def cool_walk():
    return [step("walk", "Cool-down walk", 300, "Easy walk", cue="cooldown", phase="cooldown")]

def reps(n, a, b):
    out = []
    for i in range(n):
        out += [a, b]
    return out

def open5k():
    return step("5k-open", "Your 5K, go at your pace", 2700, "", cue="run")

def slot(n, title, summary, steps, **extra):
    d = {"slot": n, "title": title, "summary": summary, "steps": steps}
    d.update(extra)
    d["mainSeconds"] = sum(s["durationSeconds"] for s in steps if s["phase"] == "main")
    d["totalSeconds"] = sum(s["durationSeconds"] for s in steps)
    return d

# ---------------- Level 1: Walk-to-Run 30 ----------------
def l1():
    rows = {
        1: (6, "0:30", "2:30"), 2: (6, "0:35", "2:30"), 3: (6, "0:40", "2:30"), 4: (6, "0:45", "2:30"),
        5: (6, "0:50", "2:30"), 6: (5, "1:00", "2:30"), 7: (5, "1:15", "2:25"), 8: (5, "1:30", "2:20"),
        9: (5, "1:45", "2:15"), 10: (5, "2:00", "2:00"), 11: (5, "2:15", "1:50"), 12: (5, "2:15", "1:45"),
        13: (4, "3:00", "1:30"), 14: (4, "3:00", "1:15"), 15: (4, "3:15", "1:15"), 16: (4, "3:30", "1:00"),
        17: (4, "3:45", "1:00"), 18: (3, "5:00", "1:30"), 19: (3, "5:00", "1:00"), 20: (3, "5:30", "1:00"),
        21: (3, "6:00", "1:00"), 22: (2, "7:00", "1:30"), 23: (2, "8:00", "1:30"), 24: (2, "8:00", "1:00"),
        25: (2, "9:00", "1:00"), 26: (2, "10:00", "1:00"), 28: (2, "8:00", "1:00"),
    }
    notes = {12: "Hold step: same jogs, shorter walks.", 22: "Lighter day, longer single jog.",
             28: "Lighter day before the milestone."}
    slots = []
    for n in range(1, 31):
        jog = lambda d: step("run", "Easy jog", t(d), RPE_JOG)
        walk = lambda d: step("walk", "Brisk walk", t(d), RPE_WALK)
        extra = {}
        if n in rows:
            k, a, b = rows[n]
            main = reps(k, jog(a), walk(b))
            summary = f"{k} x ({a} jog / {b} walk)."
            if n in notes: summary += " " + notes[n]
        elif n == 27:
            main = [jog("11:00"), walk("1:00"), jog("5:00")]
            summary = "11:00 jog / 1:00 walk / 5:00 jog."
        elif n == 29:
            main = [jog("12:00"), walk("1:00"), jog("4:00")]
            summary = "12:00 jog / 1:00 walk / 4:00 jog."
        else:  # 30
            main = [step("run", "Continuous easy jog", t("12:00"), RPE_JOG)]
            summary = "12:00 continuous easy jog. Your Walk-to-Run 30 finish."
        if n == 1: extra["checkin"] = "day1"
        if n == 30: extra["checkin"] = "day30"
        title = "Walk with jogs" if n <= 12 else ("Run / walk" if n <= 26 else ("12-minute jog" if n == 30 else "Longer jogs"))
        slots.append(slot(n, title, summary, warm_walk() + main + cool_walk(), **extra))
    return {
        "id": "walk-to-run-30", "level": 1, "name": "Walk-to-Run 30", "price": 4.99,
        "entry": "Can walk briskly for 30 minutes.", "exit": "12 minutes of continuous easy jogging.",
        "summary": "Walk with short jogs, building to 12 minutes of nonstop running.",
        "cues": "Jogs are RPE 4, full sentences. Walks are brisk, RPE 3.",
        "spacing": "max3InARowAt5", "slots": slots,
    }

# ---------------- Level 2: 5K 30 ----------------
def l2():
    E = lambda d, label="Easy run": step("easy", label, t(d), RPE_EASY, cue="run")
    W = lambda d: step("walk", "Walk", t(d), "Easy walk")
    def strides(k):
        return reps(k, step("stride", "Stride", 15, RPE_STRIDE, cue="run"), step("walk", "Walk back", 45, "Easy walk"))
    rows = [
        (1, "Easy", [E("12:00")], "12:00 continuous easy run.", {"checkin": "day1"}),
        (2, "Easy", [E("13:00")], "13:00 easy.", {}),
        (3, "Longer", reps(2, E("9:00", "Longer run"), W("1:00")), "2 x (9:00 run / 1:00 walk).", {}),
        (4, "Easy", [E("14:00")], "14:00 easy.", {}),
        (5, "Easy", [E("15:00")], "15:00 easy.", {}),
        (6, "Longer", reps(2, E("10:00", "Longer run"), W("1:00")), "2 x (10:00 run / 1:00 walk).", {}),
        (7, "Easy", [E("17:00")], "17:00 easy.", {}),
        (8, "Easy, cutback", [E("15:00")] + strides(4), "15:00 easy + 4 strides.", {}),
        (9, "Longer", reps(2, E("12:00", "Longer run"), W("1:00")), "2 x (12:00 run / 1:00 walk).", {}),
        (10, "Easy", [E("18:00")], "18:00 easy.", {}),
        (11, "Easy", [E("17:00")] + strides(4), "17:00 easy + 4 strides.", {}),
        (12, "Longer", [E("22:00", "Longer run")], "22:00 continuous.", {}),
        (13, "Easy", [E("19:00")], "19:00 easy.", {}),
        (14, "Easy, cutback", [E("17:00")] + strides(5), "17:00 easy + 5 strides.", {}),
        (15, "Longer", reps(3, E("8:00", "Longer run"), W("1:00")), "3 x (8:00 run / 1:00 walk).", {}),
        (16, "Easy", [E("21:00")], "21:00 easy.", {}),
        (17, "Easy", [E("19:00")] + strides(5), "19:00 easy + 5 strides.", {}),
        (18, "Longer", [E("25:00", "Longer run")], "25:00 continuous.", {}),
        (19, "Easy, cutback", [E("18:00")], "18:00 easy.", {}),
        (20, "Easy", [E("21:00")] + strides(6), "21:00 easy + 6 strides.", {}),
        (21, "Longer", reps(2, E("14:00", "Longer run"), W("1:00")), "2 x (14:00 run / 1:00 walk).", {}),
        (22, "Easy", [E("20:00")], "20:00 easy.", {}),
        (23, "Easy", [E("24:00")], "24:00 easy.", {}),
        (24, "First 5K", [open5k()], "Your 5K, go at your pace. Tap Finish at 5K. RPE 4 to 5, walk breaks OK.", {"fiveK": True, "fiveKEffort": "RPE 4 to 5, walk breaks OK"}),
        (25, "Extra-easy", [step("easy", "Extra-easy jog, walk any time", t("15:00"), "RPE 2 to 3", cue="run"),
                            step("easy", "Optional: up to 5 more easy minutes (skip if done)", t("5:00"), "RPE 2 to 3", cue="run", phase="optional")],
         "15:00 to 20:00 extra-easy jog, walk any time.", {}),
        (26, "Easy", [E("22:00")] + strides(6), "22:00 easy + 6 strides.", {}),
        (27, "Longer", [E("30:00", "Longer run")], "30:00 easy.", {}),
        (28, "Easy", [E("20:00")], "20:00 easy.", {}),
        (29, "Shakeout", [E("15:00")] + strides(4), "Shakeout: 15:00 easy + 4 strides.", {}),
        (30, "5K check-in", [open5k()], "5K check-in. Comfortably hard, RPE 6 to 7. Your time is compared with session 24.", {"fiveK": True, "fiveKEffort": "Comfortably hard, RPE 6 to 7", "checkin": "day30", "compareWith": 24}),
    ]
    slots = []
    for n, typ, main, summary, extra in rows:
        has_strides = any(s["type"] == "stride" for s in main)
        warm = warm_walk() + ([step("easy", "Warm-up easy jog", 120, RPE_EASY, cue="run", phase="warmup")] if has_strides else [])
        slots.append(slot(n, typ, summary, warm + main + cool_walk(), kind=typ, **extra))
    return {
        "id": "5k-30", "level": 2, "name": "5K 30", "price": 6.99,
        "entry": "Can jog 12 minutes nonstop comfortably, or finished Level 1.", "exit": "A 5K check-in.",
        "summary": "Build from 12-minute runs to your first 5K.",
        "cues": "Easy and Longer runs are RPE 3 to 4, full sentences. Walk breaks are always allowed on Longer days. Strides are 15 seconds quick and smooth, then 45 seconds walking back.",
        "spacing": "max3InARowAt5", "slots": slots,
    }

# ---------------- Level 3: Faster 5K 30 ----------------
def l3():
    E = lambda d, label="Easy run": step("easy", label, t(d), RPE_EASY, cue="run")
    def strides(k, on=20, back=70):
        return reps(k, step("stride", "Stride", on, RPE_STRIDE, cue="run"), step("walk", "Walk-jog back", back, "Easy"))
    def warm_easy():
        return [step("walk", "Warm-up brisk walk", 300, RPE_WALK, phase="warmup"), step("easy", "Warm-up easy jog", 180, RPE_EASY, cue="run", phase="warmup")]
    def warm_q():
        return ([step("walk", "Warm-up brisk walk", 300, RPE_WALK, phase="warmup"), step("easy", "Warm-up easy jog", 300, RPE_EASY, cue="run", phase="warmup")]
                + [dict(s, phase="warmup") for s in reps(2, step("stride", "Warm-up stride", 15, RPE_STRIDE, cue="run"), step("walk", "Walk back", 45, "Easy"))])
    def cool_q():
        return [step("easy", "Cool-down easy jog", 300, "Easy", cue="run", phase="cooldown"), step("walk", "Cool-down walk", 180, "Easy walk", cue="cooldown", phase="cooldown")]
    def fart(k, on, off, eff=RPE_BRISK, offlabel="Easy jog"):
        return reps(k, step("brisk", "Brisk", t(on), eff, cue="run"), step("easy", offlabel, t(off), "Easy", cue="run"))
    def hills(k, on, eff):
        return reps(k, step("uphill", "Uphill", t(on), eff, cue="run"), step("downhill-recovery", "Walk-jog down", 90, "Easy", cue="walk"))
    def work(kind, k, on, off, eff, label):
        return reps(k, step(kind, label, t(on), eff, cue="run"), step("easy", "Easy jog", t(off), "Easy", cue="run"))
    HILL = "No hill nearby? Do the same reps on a treadmill at a 4 to 6% incline, or as brisk efforts on flat ground."
    rows = [
        (1, "Trial", True, [open5k()], "Baseline 5K. Comfortably hard, RPE 6 to 7. Tap Finish at 5K.", {"fiveK": True, "fiveKEffort": "Comfortably hard, RPE 6 to 7", "checkin": "day1"}),
        (2, "Easy", False, [E("25:00")], "25:00 easy.", {}),
        (3, "Long", False, [E("30:00", "Long easy run")], "30:00 easy.", {}),
        (4, "Q", True, fart(6, "0:30", "1:30", offlabel="Easy jog or walk"), "Fartlek intro: 6 x (0:30 brisk / 1:30 easy jog or walk).", {}),
        (5, "Easy", False, [E("25:00")] + strides(4), "25:00 easy + 4 x (0:20 stride / 1:10 walk-jog back).", {}),
        (6, "Long", False, [E("32:00", "Long easy run")], "32:00 easy.", {}),
        (7, "Q", True, fart(8, "0:45", "1:15"), "Fartlek: 8 x (0:45 brisk / 1:15 easy jog).", {}),
        (8, "Easy", False, [E("25:00")], "25:00 easy.", {}),
        (9, "Long", False, [E("35:00", "Long easy run")], "35:00 easy.", {}),
        (10, "Q, cutback", True, hills(6, "0:30", "Uphill, moderate grade, RPE 7 to 8"), "Hill intro: 6 x (0:30 uphill / about 1:30 walk-jog down). " + HILL, {}),
        (11, "Easy", False, [E("20:00")] + strides(4), "20:00 easy + 4 strides (0:20 / 1:10).", {}),
        (12, "Long", False, [E("30:00", "Long easy run")], "30:00 easy.", {}),
        (13, "Q", True, work("steady", 3, "4:00", "2:00", RPE_STEADY, "Steady"), "Steady intro: 3 x (4:00 steady / 2:00 easy jog).", {}),
        (14, "Easy", False, [E("25:00")], "25:00 easy.", {}),
        (15, "Long", False, [E("36:00", "Long easy run")], "36:00 easy.", {}),
        (16, "Q", True, fart(8, "1:00", "1:00", eff="Brisk, RPE 7"), "Fartlek: 8 x (1:00 brisk / 1:00 easy).", {}),
        (17, "Easy", False, [E("25:00")] + strides(6), "25:00 easy + 6 strides (0:20 / 1:10).", {}),
        (18, "Long", False, [E("38:00", "Long easy run")], "38:00 easy.", {}),
        (19, "Q", True, hills(8, "0:45", "Uphill, RPE 8"), "Hill repeats: 8 x (0:45 uphill / about 1:30 walk-jog down). " + HILL, {}),
        (20, "Easy", False, [E("28:00")], "28:00 easy.", {}),
        (21, "Long", False, [E("40:00", "Long easy run")], "40:00 easy.", {}),
        (22, "Q, cutback", True, work("steady", 3, "5:00", "2:00", "Steady, RPE 6 to 7", "Steady"), "Steady: 3 x (5:00 steady / 2:00 easy jog).", {}),
        (23, "Easy", False, [E("20:00")] + strides(4), "20:00 easy + 4 strides.", {}),
        (24, "Long", False, [E("32:00", "Long easy run")], "32:00 easy.", {}),
        (25, "Q", True, work("tempo", 2, "8:00", "3:00", RPE_TEMPO, "Tempo"), "Tempo: 2 x (8:00 tempo / 3:00 easy jog).", {}),
        (26, "Easy", False, [E("25:00")], "25:00 easy.", {}),
        (27, "Long", False, [E("35:00", "Long easy run")], "35:00 easy.", {}),
        (28, "Q", True, work("tempo", 4, "4:00", "2:00", RPE_CRUISE, "Cruise interval"), "Cruise intervals: 4 x (4:00 / 2:00 easy jog).", {}),
        (29, "Easy", False, [E("15:00", "Shakeout easy run")] + strides(4), "Shakeout: 15:00 easy + 4 x (0:20 stride / 1:10 walk-jog back).", {}),
        (30, "Trial", True, [open5k()], "5K time trial. RPE 7 late. Your time is compared with session 1.", {"fiveK": True, "fiveKEffort": "RPE 7 late", "checkin": "day30", "compareWith": 1}),
    ]
    slots = []
    for n, typ, q, main, summary, extra in rows:
        warm = warm_q() if q else warm_easy()
        cool = cool_q() if q else cool_walk()
        slots.append(slot(n, typ, summary, warm + main + cool, kind=typ, q=q, **extra))
    return {
        "id": "faster-5k-30", "level": 3, "name": "Faster 5K 30", "price": 6.99,
        "entry": "Can run 5K, or 30 minutes, continuously.", "exit": "5K time trial versus session 1.",
        "summary": "Add speed play, hills and tempo runs for a smoother, quicker 5K.",
        "cues": "Key sessions are marked with a lightning bolt. Easy and Long days stay conversational.",
        "spacing": "noBackToBackQ", "slots": slots,
    }

for lvl in (l1(), l2(), l3()):
    assert len(lvl["slots"]) == 30, lvl["id"]
    with open(os.path.join(HERE, lvl["id"] + ".json"), "w") as f:
        json.dump(lvl, f, indent=1)
    print(lvl["id"], "max session min", max(s["totalSeconds"] for s in lvl["slots"]) // 60)
