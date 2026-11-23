#!/usr/bin/env python3
"""Doing a 5K ladder, 12-week levels (Coach Fit spec v5, Nov 22, 2026). DRAFT for Salim's approval, nothing live.
Level names decided 6:44 PM MT: always displayed with the house name ("Doing a 5K: ..."); ids walk-to-run, 5k, faster-5k.
Builds 9 files: 3 levels x 3/4/5 days a week. Same step format as PR #1's data/ladder/*.json
(type, label, durationSeconds, phase, effort, cue), plus week fields.
Run: python3 gen_ladder_12wk.py"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
WEEKS, EXTRA_WEEKS = 12, 2
ACCESS_DAYS = (WEEKS + EXTRA_WEEKS) * 7  # 98

def t(s):
    m, s2 = s.split(":"); return int(m) * 60 + int(s2)
def mmss(sec): return f"{sec//60}:{sec%60:02d}"
def step(type_, label, dur, effort="", cue=None, phase="main"):
    d = {"type": type_, "label": label, "durationSeconds": dur, "phase": phase}
    if effort: d["effort"] = effort
    if cue: d["cue"] = cue
    return d

WALK = "Brisk, RPE 3"; JOG = "RPE 4, full sentences"; EASY = "Easy, RPE 3 to 4, full sentences"
STRIDE = "Quick and smooth, RPE 7, not a sprint"; BRISK = "Brisk, RPE 6 to 7, short phrases"
STEADY = "Steady, RPE 6, short phrases"; TEMPO = "Tempo, RPE 6 to 7, short phrases"
CRUISE = "Cruise, RPE 7, short phrases"; UP = "Uphill, RPE 7 to 8, a few words at the top"
FIVEK_EFF = "5K effort, RPE 7, short phrases"; RECOV = "Very easy, RPE 2 to 3"

def wu_walk(): return [step("walk", "Warm-up brisk walk", 300, WALK, phase="warmup")]
def wu_walk_jog(j=180): return wu_walk() + [step("easy", "Warm-up easy jog", j, EASY, "run", "warmup")]
def wu_q():
    s = wu_walk_jog(300)
    for _ in range(2):
        s += [step("stride", "Warm-up stride", 15, STRIDE, "run", "warmup"), step("walk", "Walk back", 45, "Easy", phase="warmup")]
    return s
def cd_walk(): return [step("walk", "Cool-down walk", 300, "Easy walk", "cooldown", "cooldown")]
def cd_q(): return [step("easy", "Cool-down easy jog", 300, "Easy", "run", "cooldown"), step("walk", "Cool-down walk", 180, "Easy walk", "cooldown", "cooldown")]
def reps(n, a, b):
    out = []
    for _ in range(n): out += [dict(a), dict(b)]
    return out
def strides(n, on=15, back=45):
    return reps(n, step("stride", "Stride", on, STRIDE, "run"), step("walk", "Walk back", back, "Easy walk"))
def open5k(): return step("5k-open", "Your 5K, go at your pace", 2700, "", "run")

def sess(title, summary, warm, main, cool, kind, reuse, **extra):
    steps = warm + main + cool
    d = {"title": title, "summary": summary, "kind": kind, "reuse": reuse, "steps": steps}
    d.update(extra)
    d["mainSeconds"] = sum(s["durationSeconds"] for s in steps if s["phase"] == "main")
    d["totalSeconds"] = sum(s["durationSeconds"] for s in steps)
    return d

# ---------------- Level 1: Walk-to-Run ----------------
def l1_run(spec):
    """spec: ('R', n, jog, walk) reps | ('S', [(type,sec),...]) sequence | ('C', sec) continuous"""
    if spec[0] == "R":
        _, n, j, w = spec
        main = reps(n, step("run", "Easy jog", j, JOG), step("walk", "Brisk walk", w, WALK))
        return main, f"{n} x ({mmss(j)} jog / {mmss(w)} walk)", n * j
    if spec[0] == "S":
        main, parts, jt = [], [], 0
        for kind, sec in spec[1]:
            if kind == "j": main.append(step("run", "Easy jog", sec, JOG)); parts.append(f"{mmss(sec)} jog"); jt += sec
            else: main.append(step("walk", "Walk", sec, WALK)); parts.append(f"{mmss(sec)} walk")
        return main, " / ".join(parts), jt
    _, sec = spec
    return [step("run", "Continuous easy jog", sec, JOG)], f"{mmss(sec)} continuous easy jog", sec

R = lambda n, j, w: ("R", n, t(j), t(w))
L1_WEEKS = {  # week: (S1, S2, S3) core sessions; reuse = v3 slot / legacy phase
 1: [R(6,"0:30","2:30"), R(6,"0:35","2:30"), R(6,"0:40","2:30")],
 2: [R(6,"0:40","2:30"), R(6,"0:45","2:30"), R(6,"0:50","2:30")],
 3: [R(5,"1:00","2:30"), R(5,"1:15","2:25"), R(5,"1:15","2:25")],
 4: [R(5,"1:30","2:20"), R(5,"1:45","2:15"), R(5,"1:45","2:15")],
 5: [R(5,"2:00","2:00"), R(5,"2:15","1:50"), R(5,"2:15","1:45")],
 6: [R(4,"3:00","1:30"), R(4,"3:00","1:15"), R(4,"3:00","1:15")],
 7: [R(4,"3:15","1:15"), R(4,"3:30","1:00"), R(4,"3:45","1:00")],
 8: [R(3,"5:00","1:30"), R(3,"5:00","1:00"), R(3,"5:30","1:00")],
 9: [R(3,"6:00","1:00"), R(2,"7:00","1:30"), R(2,"8:00","1:30")],
 10: [R(2,"8:00","1:00"), R(2,"9:00","1:00"), R(2,"10:00","1:00")],
 11: [("S",[("j",660),("w",60),("j",300)]), R(2,"8:00","1:00"), ("S",[("j",720),("w",60),("j",240)])],
 12: [("S",[("j",720),("w",60),("j",240)]), R(2,"8:00","1:00"), ("C", 720)],
}
L1_REUSE = {1:"Legacy P1",2:"Legacy P1",3:"Legacy P2",4:"Legacy P2",5:"Legacy P2",6:"Legacy P3 (adjusted)",
            7:"Legacy P3 (adjusted)",8:"Legacy P4 (adjusted)",9:"Legacy P4 (adjusted) + new",10:"New",11:"New",12:"New + Legacy P5 (12:00)"}
def l1_week(w):
    out = {}
    for i, spec in enumerate(L1_WEEKS[w], 1):
        main, summ, jt = l1_run(spec)
        title = "Walk with jogs" if w <= 5 else ("Run / walk" if w <= 9 else "Build endurance")
        extra = {}
        if w == 1 and i == 1: extra["checkin"] = "day1"
        if w == 12 and i == 3: title, extra["checkin"] = "Milestone: 12 minutes nonstop", "final"
        out[f"S{i}"] = sess(title, summ + ".", wu_walk(), main, cd_walk(), "Core", f"v3 L1 / {L1_REUSE[w]}", **extra)
    s1 = out["S1"]
    out["S4"] = dict(s1, title="Repeat and settle", kind="Repeat", reuse="Repeat of this week's session 1", **({} if "checkin" not in s1 else {}))
    out["S4"].pop("checkin", None)
    out["S5"] = sess("Brisk walk", "20:00 brisk walk.", wu_walk(), [step("walk", "Brisk walk", 1200, WALK)], cd_walk(), "Easy movement", "New")
    return out

# ---------------- Level 2: 5K ----------------
def easy(mins, k=0, label="Easy run"):
    main = [step("easy", label, mins * 60, EASY, "run")] + (strides(k) if k else [])
    summ = f"{mins}:00 easy" + (f" + {k} strides (0:15 quick / 0:45 walk back)" if k else "")
    return main, summ
L2_WEEKS = {
 1: [("E",12,0),("E",13,0),("L",[(540,60),(540,0)])],
 2: [("E",14,0),("E",13,4),("L",[(600,60),(600,0)])],
 3: [("E",15,0),("E",15,4),("L",[(720,60),(720,0)])],
 4: [("E",14,0),("E",14,4),("L",[(1200,0)])],
 5: [("E",17,0),("E",16,4),("L",[(1320,0)])],
 6: [("E",18,0),("E",17,5),("L",[(1440,0)])],
 7: [("E",17,0),("E",16,5),("L",[(480,60),(480,60),(480,0)])],
 8: [("E",20,0),("E",19,6),("L",[(1560,0)])],
 9: [("E",21,0),("E",20,6),("L",[(840,60),(840,0)])],
 10: [("E",22,0),("E",20,6),("5K","first")],
 11: [("X",18,0),("E",22,6),("L",[(1800,0)])],
 12: [("E",20,0),("SH",15,4),("5K","final")],
}
L2_REUSE = {1:"Legacy P5 (13:00 to 14:00)",2:"Legacy P5",3:"Legacy P5 + new",4:"New",5:"New",6:"New",7:"New",8:"New",9:"New",10:"New + Legacy P6 (5K run)",11:"New",12:"New + Legacy P6 (5K run)"}
def l2_build(spec, w, i):
    kind = spec[0]
    if kind in ("E", "X", "SH"):
        _, m, k = spec
        label = {"E": "Easy run", "X": "Extra-easy run", "SH": "Shakeout run"}[kind]
        main, summ = easy(m, k, label)
        if kind == "X": main[0]["effort"] = RECOV + ", walk any time"; summ = f"{m}:00 extra-easy, walk any time"
        warm = wu_walk_jog(120) if k else wu_walk()
        title = {"E": "Easy", "X": "Extra-easy", "SH": "Shakeout"}[kind] + (" + strides" if k else "")
        return sess(title, summ + ".", warm, main, cd_walk(), "Core", f"v3 L2 / {L2_REUSE[w]}")
    if kind == "L":
        main, parts = [], []
        for run, walk in spec[1]:
            main.append(step("easy", "Longer run", run, EASY + ", walk breaks OK", "run")); parts.append(f"{mmss(run)} run")
            if walk: main.append(step("walk", "Walk", walk, "Easy walk")); parts.append(f"{mmss(walk)} walk")
        return sess("Longer", " / ".join(parts) + ".", wu_walk(), main, cd_walk(), "Core", f"v3 L2 / {L2_REUSE[w]}")
    first = spec[1] == "first"
    eff = "RPE 4 to 5, walk breaks OK" if first else "Comfortably hard, RPE 6 to 7"
    m = open5k()
    return sess("First 5K" if first else "5K check-in", f"Your 5K: count-up timer, tap Finish at 5K (auto-stops 45:00). {eff}.",
                wu_walk(), [m], cd_walk(), "5K", "Legacy P6 (5K run), new 5k-open timer",
                fiveK=True, fiveKEffort=eff, **({} if first else {"checkin": "final"}))
def l2_week(w):
    out = {f"S{i}": l2_build(s, w, i) for i, s in enumerate(L2_WEEKS[w], 1)}
    if w == 1: out["S1"]["checkin"] = "day1"
    s1m = L2_WEEKS[w][0][1]
    m = max(12, s1m - 2)
    main, summ = easy(m)
    out["S4"] = sess("Easy", summ + ".", wu_walk(), main, cd_walk(), "Repeat", "Shorter repeat of this week's session 1")
    out["S5"] = sess("Easy movement", "25:00 brisk walk or easy cycling.", wu_walk(), [step("walk", "Brisk walk or easy cycling", 1500, WALK)], cd_walk(), "Easy movement", "New")
    return out

# ---------------- Level 3: Faster 5K ----------------
def q(name, n, on, on_label, on_eff, off, off_label, off_type="easy"):
    return name, reps(n, step({"Uphill": "uphill"}.get(on_label, "brisk" if "Brisk" in on_label else on_label.lower().split()[0]), on_label, on, on_eff, "run"),
                     step(off_type, off_label, off, "Easy" if off_type == "easy" else "Easy, walk or jog down")), f"{n} x ({mmss(on)} {on_label.lower()} / {mmss(off)} {off_label.lower()})"
L3_Q = {
 2: ("Fartlek intro", 6, 30, "Brisk", BRISK, 90, "Easy jog or walk", "B1"),
 3: ("Fartlek", 8, 45, "Brisk", BRISK, 75, "Easy jog", "B3"),
 4: ("Hill intro", 6, 30, "Uphill", UP, 90, "Walk-jog down", "B5"),
 5: ("Steady intro", 3, 240, "Steady", STEADY, 120, "Easy jog", "B6"),
 6: ("Fartlek", 8, 60, "Brisk", "Brisk, RPE 7, short phrases to a few words", 60, "Easy jog", "B8 / A1"),
 7: ("Hill repeats", 8, 45, "Uphill", "Uphill, RPE 8, a few words", 90, "Walk-jog down", "B9 / A2"),
 8: ("Steady", 3, 300, "Steady", "Steady, RPE 6 to 7, short phrases", 120, "Easy jog", "B7"),
 9: ("Tempo", 2, 480, "Tempo", TEMPO, 180, "Easy jog", "B10"),
 10: ("Cruise intervals", 4, 240, "Cruise", CRUISE, 120, "Easy jog", "B11"),
 12: ("5K sharpener", 5, 120, "5K effort", FIVEK_EFF, 120, "Easy jog", "New"),
}
L3_EL = {1:(25,0,30),2:(25,4,32),3:(25,0,34),4:(20,4,30),5:(25,0,36),6:(25,6,38),7:(28,0,40),8:(20,4,32),9:(25,0,38),10:(25,6,40),11:(25,0,35),12:(15,4,None)}
def l3_easy(m, k, title="Easy"):
    main = [step("easy", "Easy run", m * 60, EASY, "run")] + (strides(k, 20, 70) if k else [])
    summ = f"{m}:00 easy" + (f" + {k} strides (0:20 quick / 1:10 walk-jog back)" if k else "")
    return sess(title + (" + strides" if k else ""), summ + ".", wu_walk_jog(180), main, cd_walk(), "Core", "Generic easy" + (" + B4/A4 strides" if k else ""))
def l3_week(w):
    out = {}
    if w == 1:
        eff = "Comfortably hard, RPE 6 to 7"
        out["S1"] = sess("⚡ Baseline 5K", f"Count-up timer, tap Finish at 5K (auto-stops 45:00). {eff}.", wu_q(), [open5k()], cd_q(), "Trial", "Legacy P6 + new 5k-open timer", q=True, fiveK=True, fiveKEffort=eff, checkin="day1")
    elif w == 11:
        out["S1"] = sess("⚡ Continuous tempo", "15:00 continuous tempo, RPE 6 to 7.", wu_q(), [step("tempo", "Tempo", 900, TEMPO, "run")], cd_q(), "Q", "A7 (shortened to 15:00)", q=True)
    else:
        name, n, on, onl, one, off, offl, src = L3_Q[w]
        offt = "downhill-recovery" if "down" in offl else "easy"
        typ = {"Brisk": "brisk", "Uphill": "uphill", "Steady": "steady", "Tempo": "tempo", "Cruise": "tempo", "5K effort": "tempo"}[onl]
        main = reps(n, step(typ, onl, on, one, "run"), step(offt, offl, off, "Easy" if offt == "easy" else "Easy, walk or jog down"))
        out["S1"] = sess("⚡ " + name, f"{n} x ({mmss(on)} {onl.lower()} / {mmss(off)} {offl.lower()}).", wu_q(), main, cd_q(), "Q", src, q=True)
    e, k, l = L3_EL[w]
    out["S2"] = l3_easy(e, k, "Shakeout" if w == 12 else "Easy")
    if w == 12:
        eff = "Comfortably hard, RPE 7 late"
        out["S3"] = sess("⚡ 5K time trial", f"Count-up timer, tap Finish at 5K (auto-stops 45:00). {eff}. Compare with week 1.", wu_q(), [open5k()], cd_q(), "Trial", "Legacy P6 + new 5k-open timer", q=True, fiveK=True, fiveKEffort=eff, checkin="final")
    else:
        out["S3"] = sess("Long easy", f"{l}:00 easy.", wu_walk_jog(180), [step("easy", "Long easy run", l * 60, EASY, "run")], cd_walk(), "Core", "Generic long easy")
    out["S4"] = l3_easy(20, 4 if w % 2 == 0 else 0); out["S4"]["kind"] = "Easy extra"
    out["S5"] = sess("Recovery", "20:00 very easy jog, or 25:00 brisk walk or easy cycling.", wu_walk(), [step("easy", "Recovery jog or cross-train", 1200, RECOV)], cd_walk(), "Easy movement", "New")
    return out

# Weekly order by days a week. Milestone/long session always last in the week.
ORDER = {3: ["S1", "S2", "S3"], 4: ["S1", "S2", "S4", "S3"], 5: ["S1", "S2", "S5", "S4", "S3"]}
LEVELS = [
 dict(id="walk-to-run", level=1, name="Walk-to-Run", displayName="Doing a 5K: Walk-to-Run", price=4.99, weekFn=l1_week, spacing="max3RunDaysInARow",
      entry="Can walk briskly for 30 minutes.", exit="12 minutes of continuous easy jogging.",
      summary="Walk with short jogs, building to 12 minutes of nonstop running.",
      cues="Jogs are RPE 4, full sentences. Walks are brisk, RPE 3."),
 dict(id="5k", level=2, name="5K", displayName="Doing a 5K: 5K", price=6.99, weekFn=l2_week, spacing="max3RunDaysInARow",
      entry="Can jog 12 minutes nonstop comfortably, or finished Level 1.", exit="A 5K check-in.",
      summary="Build from 12-minute runs to your first 5K.",
      cues="Easy and Longer runs are RPE 3 to 4, full sentences. Walk breaks are always allowed on Longer days. Strides are 15 seconds quick and smooth, then 45 seconds walking back."),
 dict(id="faster-5k", level=3, name="Faster 5K", displayName="Doing a 5K: Faster 5K", price=6.99, weekFn=l3_week, spacing="noBackToBackQ",
      entry="Can run 5K, or 30 minutes, continuously.", exit="5K time trial versus week 1.",
      summary="Add speed play, hills and tempo runs for a smoother, quicker 5K.",
      cues="Key sessions are marked with a lightning bolt. Easy and Long days stay conversational."),
]
index = []
for L in LEVELS:
    weeks = {w: L["weekFn"](w) for w in range(1, WEEKS + 1)}
    for d in (3, 4, 5):
        slots, n = [], 0
        for w in range(1, WEEKS + 1):
            for j, key in enumerate(ORDER[d], 1):
                n += 1
                s = json.loads(json.dumps(weeks[w][key]))
                slots.append({"slot": n, "week": w, "weekSession": j, "template": key, **s})
        doc = {k: L[k] for k in ("id", "level", "name", "displayName", "price", "entry", "exit", "summary", "cues", "spacing")}
        doc.update({"daysPerWeek": d, "weeks": WEEKS, "extraWeeks": EXTRA_WEEKS, "accessDays": ACCESS_DAYS,
                    "totalSessions": len(slots), "accessStarts": "purchase (gift: redemption)", "slots": slots})
        fn = f"{L['id']}-{d}x.json"
        json.dump(doc, open(os.path.join(HERE, fn), "w"), indent=1, ensure_ascii=False)
        index.append({"file": fn, "id": L["id"], "displayName": L["displayName"], "level": L["level"], "daysPerWeek": d, "totalSessions": len(slots)})
json.dump({"accessDays": ACCESS_DAYS, "accessStartsSelf": "purchase date", "accessStartsGift": "redemption date", "giftCodeRedeemableYears": 5, "warningsDaysLeft": [28, 14, 5], "warningRule": "compute from the actual access end date; never mention $2.99", "cantFinishRule": "sessions left > days left (one session per day max)", "restart": {"price": 2.99, "offerDaysAfterExpiry": 30, "newAccessDays": ACCESS_DAYS}, "repeat": {"price": 2.99, "newAccessDays": ACCESS_DAYS}, "files": index}, open(os.path.join(HERE, "index.json"), "w"), indent=1)

# Markdown weekly tables for the spec
md = []
for L in LEVELS:
    md.append(f"\n#### Level {L['level']}: {L['displayName']} (${L['price']:.2f}), weekly sessions\n")
    md.append("| Wk | S1 | S2 | S3 (last session of the week) | S4 (4 to 5 days/wk) | S5 (5 days/wk) |\n|---|---|---|---|---|---|")
    for w in range(1, WEEKS + 1):
        wk = L["weekFn"](w)
        cell = lambda k: f"**{wk[k]['title']}**: {wk[k]['summary']} _({wk[k]['reuse']})_"
        md.append(f"| {w} | " + " | ".join(cell(k) for k in ("S1", "S2", "S3", "S4", "S5")) + " |")
open(os.path.join(HERE, "weekly-tables.md"), "w").write("\n".join(md) + "\n")
print("ok", index)
