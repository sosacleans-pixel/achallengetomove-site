import json
MI_KM = 1.609344
def km(mi): return round(mi * MI_KM, 1)

RPE = {
 "recovery": ("2-3", "Easy talking, could sing a line or two"),
 "easy": ("3-4", "Full sentences, relaxed breathing"),
 "long": ("3-4", "Full sentences; walk breaks always allowed"),
 "race": ("5-6 early, up to 7 in the last 5K", "Sentences early, then short phrases late"),
}
EASY_WUCD = "First 5 min extra-easy jog or brisk walk (warm-up); last 3-5 min easy jog to walk (cool-down)"
LONG_WUCD = "First 5-10 min slower than easy (warm-up); finish with 5 min walk (cool-down)"

# ---------------- Workouts ----------------
# (week, id, name, wu, main_desc, main_min, cd, rpe, talk)
BW = [
 (1,"B1","Fartlek intro",10,"6 x (30 s brisk / 90 s easy jog or walk)",12,8,"6-7 brisk, 3 recoveries","Short phrases on the brisk parts"),
 (2,"B2","Fartlek",10,"7 x (30 s brisk / 90 s easy jog or walk)",14,8,"6-7 brisk, 3 recoveries","Short phrases on the brisk parts"),
 (3,"B3","Fartlek",10,"8 x (45 s brisk / 75 s easy jog)",16,8,"6-7 brisk, 3 recoveries","Short phrases on the brisk parts"),
 (4,"B4","Easy + strides (cutback)",20,"4 x 20 s strides, 70 s walk/jog back after each",6,4,"3-4 easy; strides smooth and quick, not a sprint","Full sentences on the easy part"),
 (5,"B5","Hill intro",12,"6 x (30 s uphill at moderate grade / about 90 s walk-jog down)",12,11,"7-8 uphill","A few words at the top of each hill"),
 (6,"B6","Steady intro",12,"3 x 4 min steady, 2 min easy jog after each",18,8,"6 steady","Short phrases"),
 (7,"B7","Steady",12,"3 x 5 min steady, 2 min easy jog after each",21,7,"6-7 steady","Short phrases"),
 (8,"B8","Fartlek (cutback)",10,"8 x (1 min brisk / 1 min easy)",16,9,"7 brisk","Short phrases to a few words"),
 (9,"B9","Hill repeats",12,"8 x (45 s uphill / about 90 s walk-jog down)",18,10,"8 uphill","A few words"),
 (10,"B10","Tempo",12,"2 x 8 min tempo, 3 min easy jog after each",22,8,"6-7 tempo","Short phrases"),
 (11,"B11","Cruise intervals",12,"4 x 4 min, 2 min easy jog after each",24,6,"7","Short phrases"),
 (12,"B12","Steady + strides (cutback)",12,"10 min steady, 5 min easy, then 4 x 20 s strides with 70 s walk/jog back",21,5,"6 steady; strides quick and relaxed","Short phrases on the steady part"),
 (13,"B13","Half-marathon effort segments",12,"3 x 6 min at goal half-marathon effort, 2 min easy jog after each",24,6,"6","Short phrases"),
 (14,"B14","Half-marathon effort segments",12,"2 x 10 min at goal half-marathon effort, 3 min easy jog after each",26,7,"6","Short phrases"),
 (15,"B15","Taper sharpener",12,"3 x 5 min at half-marathon effort, 2 min easy jog after each",21,5,"6","Short phrases"),
 (16,"B16","Race-week shakeout",15,"4 x 20 s strides, 70 s walk/jog back after each",6,4,"3-4 easy; strides relaxed","Full sentences on the easy part"),
]
AW = [
 (1,"A1","Fartlek",12,"8 x (1 min brisk / 1 min easy)",16,12,"7 brisk","Short phrases to a few words"),
 (2,"A2","Hill repeats",12,"8 x (45 s uphill / about 90 s jog down)",18,10,"8 uphill","A few words"),
 (3,"A3","Tempo",12,"2 x 8 min tempo, 2 min easy jog after each",20,10,"6-7 tempo","Short phrases"),
 (4,"A4","Easy + strides (cutback)",15,"6 x 20 s strides, 70 s walk/jog back after each",9,11,"3-4 easy; strides smooth and quick","Full sentences on the easy part"),
 (5,"A5","Cruise intervals",12,"4 x 5 min, 1 min easy jog after each",24,6,"7","Short phrases"),
 (6,"A6","Hill repeats",12,"8 x (60 s uphill / about 90 s jog down)",20,13,"8 uphill","A few words"),
 (7,"A7","Continuous tempo",12,"20 min continuous tempo",20,13,"6-7","Short phrases"),
 (8,"A8","Fartlek (cutback)",12,"6 x (2 min hard / 1 min easy)",18,10,"7-8 hard","A few words"),
 (9,"A9","Half-marathon effort segments",10,"3 x 8 min at goal half-marathon effort, 2 min easy jog after each",30,5,"6","Short phrases"),
 (10,"A10","Half-marathon effort segments",12,"2 x 12 min at goal half-marathon effort, 3 min easy jog after each",30,6,"6","Short phrases"),
 (11,"A11","Taper sharpener",10,"3 x 6 min at half-marathon effort, 2 min easy jog after each",24,6,"6","Short phrases"),
 (12,"A12","Race-week shakeout",18,"4 x 20 s strides, 70 s walk/jog back after each",6,6,"3-4 easy; strides relaxed","Full sentences on the easy part"),
]

# ---------------- Plan definitions ----------------
BEG = dict(
 weeks=16, pace_long=13.0, race_pace=12.0,
 phase=lambda w: "Base" if w<=5 else "Build" if w<=10 else "Peak" if w<=14 else "Taper",
 flags={4:"Cutback",8:"Cutback",12:"Cutback",15:"Taper",16:"Taper / Race"},
 W=[30,32,34,30,35,38,40,35,40,42,42,38,42,45,38,25],
 E=[30,30,32,28,35,35,38,30,40,40,40,35,40,40,35,20],
 L=[3,3.5,4,3,4.5,5,5.5,4,6,7,8,6,9,10,6,13.1],
 R=[20,20,22,20,25,25,28,20,30,30,30,25,30,30,25,15],
 strides_easy={9,10,11,13,14},
 workouts=BW,
)
AVG = dict(
 weeks=12, pace_long=11.0, race_pace=10.0,
 phase=lambda w: "Base" if w<=4 else "Build" if w<=8 else "Peak" if w<=10 else "Taper",
 flags={4:"Cutback",8:"Cutback",11:"Taper",12:"Taper / Race"},
 W=[40,40,42,35,42,45,45,40,45,48,40,30],
 E=[40,40,40,35,42,42,45,40,45,45,35,25],
 L=[5,6,7,5,8,9,10,7,11,12,8,13.1],
 R=[25,25,28,20,30,30,30,25,30,30,25,15],
 strides_easy={5,6,7,9,10},
 workouts=AW,
)
for P in (BEG,AVG):
    for w in P["workouts"]:
        assert w[3]+w[5]+w[6]==P["W"][w[0]-1], (w, P["W"][w[0]-1])

def strength_for(level, w, P):
    ph = P["phase"](w); flag = P["flags"].get(w,"")
    last = P["weeks"]
    if w==last: return None, "None (optional 10 min mobility Mon)"
    if w==last-1: return ["A"], "A only, light (taper dose)"
    if flag=="Cutback": return ["A"], "A only (cutback: 1 session, 1 fewer set)"
    if ph=="Peak": return ["A","B"], "A + B (maintain dose; B optional)"
    return ["A","B"], "A + B"

def build_plan(level, days, P):
    weeks=[]
    for i in range(P["weeks"]):
        w=i+1; ph=P["phase"](w); flag=P["flags"].get(w,"")
        wo=P["workouts"][i]; race = (w==P["weeks"])
        sess=[]
        strg, strg_label = strength_for(level,w,P)
        # Mon
        if strg and "A" in strg:
            sess.append(dict(day_slot="Mon",type="strength",session="A",duration_min=25 if "light" not in strg_label else 20,
                effort_rpe="5-7 (see strength phase dose)",talk_test="n/a",notes=f"Strength A - {strg_label}. 5 min warm-up included."))
        else:
            sess.append(dict(day_slot="Mon",type="rest",notes="Rest or optional 10 min easy mobility. No strength in race week."))
        # Tue workout
        wtype = "strides" if ("strides" in wo[2].lower() and wo[0] in (4,) ) else "workout"
        if race: wtype="strides"
        sess.append(dict(day_slot="Tue",type=wtype,workout_id=wo[1],name=wo[2],duration_min=P["W"][i],
            effort_rpe=wo[7],talk_test=wo[8],warmup=f"{wo[3]} min easy jog (RPE 3-4)",
            main=f"{wo[4]} ({wo[5]} min)",cooldown=f"{wo[6]} min easy jog/walk",
            notes="See Workout Library for full details."))
        sess.append(dict(day_slot="Wed",type="rest",notes="Rest (walking and gentle mobility fine)."))
        # Thu easy
        e_type = "easy + strides" if w in P["strides_easy"] else "easy"
        en = EASY_WUCD
        if w in P["strides_easy"]: en += "; in the last 6 min do 4 x 20 s strides with 70 s walk/jog back"
        if race: en = "Short and relaxed. Nothing hard. " + EASY_WUCD
        if level=="Beginner" and w<=4: en += ". Run-walk (e.g., 4 min run / 1 min walk) allowed."
        rp,tt = RPE["easy"]
        sess.append(dict(day_slot="Thu",type=e_type,duration_min=P["E"][i],effort_rpe=rp,talk_test=tt,
            warmup="5 min extra-easy",cooldown="3-5 min easy to walk",notes=en))
        if strg and "B" in strg:
            sess.append(dict(day_slot="Thu",type="strength",session="B",duration_min=25,effort_rpe="5-7 (see strength phase dose)",talk_test="n/a",
                notes="Strength B after the easy run (or later the same day). " + ("Optional in Peak phase." if ph=="Peak" else "")))
        # Fri
        if days==4:
            rp,tt = RPE["recovery"]
            rn = "Very easy. Run-walk is fine. Skip it if anything aches." 
            if race: rn = "Race-eve shakeout: 15 min very easy + 3 x 15 s relaxed strides. Lay out race gear."
            sess.append(dict(day_slot="Fri",type="recovery",duration_min=P["R"][i],effort_rpe=rp,talk_test=tt,
                warmup="Start with 3-5 min brisk walk",cooldown="Walk 2-3 min",notes=rn))
        else:
            sess.append(dict(day_slot="Fri",type="rest",notes="Rest before the long run." + (" Optional 10 min walk + 3 relaxed strides as a race-eve shakeout." if race else "")))
        # Sat long/race
        mi=P["L"][i]
        if race:
            rp,tt = RPE["race"]
            sess.append(dict(day_slot="Sat",type="race",distance_mi=13.1,distance_km=21.1,effort_rpe=rp,talk_test=tt,
                warmup="5-10 min walk + 3-5 min very easy jog + 2-3 relaxed strides",cooldown="10 min walk, then fluids and food",
                notes="RACE DAY: half marathon 13.1 mi / 21.1 km. Start slower than you think (first 2-3 mi at easy-to-steady effort), settle into half-marathon effort, and only push in the last 3 mi (5 km) if you feel good. Use only fuel and shoes you practiced with."))
        else:
            rp,tt = RPE["long"]
            ln = LONG_WUCD + "."
            if level=="Beginner": ln += " Run-walk (e.g., 4:1 or 9:1 run:walk minutes) is always acceptable."
            if mi >= 6: ln += " Practice fueling and fluids (see Fueling notes)."
            if level=="Average" and w in (7,9): ln += " Optional: last 1-2 mi (1.6-3.2 km) at steady RPE 5-6 only if you feel good."
            sess.append(dict(day_slot="Sat",type="long",distance_mi=mi,distance_km=km(mi),effort_rpe=rp,talk_test=tt,
                warmup="5-10 min slower than easy",cooldown="5 min walk",notes=ln))
        if race:
            sess.append(dict(day_slot="Sun",type="rest",notes="Rest. Gentle 15-20 min walk optional. Easy running can resume after 3-5+ days if pain-free."))
        else:
            sess.append(dict(day_slot="Sun",type="rest",notes="Rest."))
        run_min = P["W"][i]+P["E"][i]+(P["R"][i] if days==4 else 0)
        est = run_min + mi*(P["race_pace"] if race else P["pace_long"])
        weeks.append(dict(week=w,phase=ph,flag=flag or None,long_run_mi=mi,long_run_km=21.1 if race else km(mi),
            non_long_run_minutes=run_min,est_total_run_minutes=round(est),strength=strg_label,sessions=sess))
    # progression check
    mx=None
    for wk in weeks:
        f=wk["flag"] or ""
        if mx is not None and wk["week"]!=P["weeks"]:
            wk["pct_vs_prior_peak_week"]=round((wk["est_total_run_minutes"]/mx-1)*100,1)
        if not f: mx = max(mx or 0, wk["est_total_run_minutes"])
    return weeks

PLANS=[]
for level,P,days in [("Beginner",BEG,3),("Beginner",BEG,4),("Average",AVG,3),("Average",AVG,4)]:
    PLANS.append(dict(id=f"{level.lower()}-{days}day",level=level,days_per_week=days,weeks_total=P["weeks"],
        assumed_long_run_pace_min_per_mi=P["pace_long"],assumed_race_pace_min_per_mi=P["race_pace"],weeks=build_plan(level,days,P)))

# ---------- Checks ----------
problems=[]
for p in PLANS:
    for wk in p["weeks"]:
        pc=wk.get("pct_vs_prior_peak_week")
        if pc is not None and pc>10.0 and not wk["flag"]: problems.append((p["id"],wk["week"],pc))
print("PROGRESSION PROBLEMS:",problems)
for p in PLANS:
    print(p["id"],[ (w["week"],w["est_total_run_minutes"],w.get("pct_vs_prior_peak_week")) for w in p["weeks"]])

# ---------------- Static content ----------------
PUSHUP_RULES = "Full push-ups from the toes on the floor (no knees). Body straight from head to heels, chest lowers to about a fist's height from the floor, arms fully straight at the top. Count clean reps until the first form break or a pause of more than 2 s."
RUNCHECK_RULES = "On a flat route or treadmill, run or jog at an easy, conversational pace (RPE 3-4, full sentences) for as long as you can without walking. Stop the clock at the first walk step or at 45 min. Stop immediately on any warning sign in the disclaimer."
META = dict(
 program="Doing a 5K - Half Marathon Goal",
 publisher="Coach Salim Heyaime LLC",
 goal_distance=dict(mi=13.1,km=21.1),
 version="2.0", date="2026-10-17",
 onboarding=dict(
   order=["goal","days_per_week","equipment","run_level","strength_level"],
   days_per_week_options=[3,4],
   equipment_options=["none","dumbbells","kettlebells_and_essentials"],
   equipment_essentials_kit=["dumbbells","kettlebell(s)","mini-band","long resistance band","sturdy step or bench","exercise mat"],
   equipment_optional=["foam roller","doorway pull-up bar","TRX/suspension straps"],
   equipment_note="'Kettlebells and essentials' means the full essentials kit. Optional items unlock extra pull-up, inverted-row and assisted options; ask as a separate multi-select.",
   levels_independent=True,
   levels_note="Run level and strength level are set separately. Run level picks the plan length (16 or 12 weeks); strength level picks the strength doses and push-up progression. Any combination is valid, e.g. Beginner run + Average strength.",
   run_level=dict(
     sets="running plan (Beginner 16 weeks / Average 12 weeks)",
     method_a=dict(name="Continuous-run check",rules=RUNCHECK_RULES,
       extra_questions=["Are you currently running about 3 days a week? (yes/no)","Have you run 4 mi (6.4 km) or more in the past month? (yes/no)"],
       scoring=[
         dict(result="Under 20 min continuous (and cannot complete 30 min of run-walk)",run_level="Not ready",action="Finish the 5K track in the Doing a 5K app first, then retake the check."),
         dict(result="20-39 min continuous, OR 30 min of run-walk (e.g., 4 min run / 1 min walk)",run_level="Beginner",plan_weeks=16),
         dict(result="40+ min continuous AND currently running about 3x/week AND a 4 mi (6.4 km) run recently",run_level="Average",plan_weeks=12),
         dict(result="40+ min continuous but missing either of the other two",run_level="Beginner",plan_weeks=16)]),
     method_b=dict(name="No-test questions",
       questions=[dict(id="continuous_run_min",text="How long can you run without stopping?",options=["<20 min","20-39 min","40+ min"]),
                  dict(id="run_days_now",text="How many days a week do you run now?",options=["0-1","2","3+"])],
       scoring=[
         dict(result="<20 min (any days)",run_level="Not ready",action="Finish the 5K track in the Doing a 5K app first."),
         dict(result="20-39 min (any days)",run_level="Beginner",plan_weeks=16),
         dict(result="40+ min AND 0-1 or 2 days",run_level="Beginner",plan_weeks=16),
         dict(result="40+ min AND 3+ days",run_level="Average",plan_weeks=12)])),
   strength_level=dict(
     sets="strength doses and push-up progression (Beginner strength / Average strength)",
     test=dict(name="Max floor push-up test",rules=PUSHUP_RULES,
       scoring=[dict(range="0-7",strength_level="Beginner"),dict(range="8+",strength_level="Average")]))),
)
DISCLAIMER = ("This program is general fitness education, not medical advice, diagnosis or treatment. Check with a doctor or qualified "
 "healthcare provider before starting, especially if you have a heart, lung, metabolic or joint condition, are pregnant or postpartum, "
 "take medication that affects heart rate or blood pressure, have been inactive for a long time, or have current pain or injury. "
 "Stop exercising right away and seek medical care if you have chest pain or pressure, unusual shortness of breath, dizziness or "
 "lightheadedness, fainting, an irregular or racing heartbeat, or sudden severe pain. You are responsible for exercising within your limits.")
PREREQ = dict(
 all=["Pain-free walking and easy running (no pain that makes you limp or change your stride).",
      "Able to train 3 or 4 days per week for the full plan length (16 or 12 weeks), plus 1-2 short strength sessions.",
      "Read and accept the medical disclaimer; get medical clearance if any item in it applies to you.",
      "Run level (from the continuous-run check or the two questions) sets the plan. Strength level (push-up test) is separate and does not change the plan length."],
 not_ready=["Under 20 min of continuous easy running, and you can't complete 30 min of run-walk: you're not ready for this plan yet. Finish the 5K track in the Doing a 5K app first, then retake the run check."],
 beginner=["Run level Beginner: 20-39 min of continuous easy running, OR 30 min of run-walk (e.g., 4 min run / 1 min walk). Also Beginner: 40+ min continuous but not yet running about 3x/week or no recent 4 mi run.",
      "Run-walk entrants: use run-walk on all easy and long runs in Weeks 1-4 and shift toward continuous running as it feels easy. Walk breaks remain allowed on long runs for the whole plan."],
 average=["Run level Average: 40+ min of continuous easy running AND currently running about 3 days a week AND a run of at least 4 mi (6.4 km) recently (past month). Question route: 40+ min AND 3+ days a week.",
      "4-day Average: you should already be running about 2 to 2.5 hours per week; if not, choose the 3-day version."],
)
EFFORT = [
 dict(rpe="1-2",label="Very easy",talk_test="Could sing; walking pace",used_for="Warm-up walking, recovery between strides/hills"),
 dict(rpe="2-3",label="Recovery",talk_test="Easy talking, could sing a line or two",used_for="Recovery runs (4-day plans), walk-jog recoveries"),
 dict(rpe="3-4",label="Easy",talk_test="Full sentences, relaxed breathing",used_for="Easy runs, long runs, warm-ups and cool-downs (about 80% of all running)"),
 dict(rpe="5",label="Moderate",talk_test="Sentences, but you notice the effort",used_for="Optional steady finish on some long runs"),
 dict(rpe="6",label="Steady / half-marathon effort",talk_test="Short phrases (4-6 words)",used_for="Steady segments and goal half-marathon effort segments"),
 dict(rpe="6-7",label="Tempo / comfortably hard",talk_test="Short phrases, 3-5 words",used_for="Tempo runs and cruise intervals"),
 dict(rpe="7-8",label="Hard (intervals, hills)",talk_test="A few words at a time",used_for="Hill repeats, fartlek surges, short intervals"),
 dict(rpe="9-10",label="Very hard / max",talk_test="Cannot talk",used_for="Not used in this plan"),
 dict(rpe="Strides",label="Strides",talk_test="n/a (too short to matter)",used_for="15-20 s smooth, quick, relaxed running building to about RPE 7-8 (fast but never a sprint), then walk or jog 60-90 s until fully recovered. Improves form and leg speed without fatigue."),
]
EFFORT_NOTES = ["Run by effort, not pace. Heat, hills, wind, altitude, poor sleep and stress all raise effort at the same pace.",
 "Goal half-marathon effort = an effort you could hold for roughly 2-3 hours; for most people RPE 6, short phrases.",
 "If you can't pass the talk test on an easy day, slow down or walk until you can. Easy days that are too hard are the most common mistake."]

PHASE_INFO = {
 "Base":"Build the habit and durability: mostly easy running, short controlled surges (fartlek), intro hills and strides.",
 "Build":"Extend steady and tempo work, longer hills, longer long runs.",
 "Peak":"Practice half-marathon effort, longest long runs, strength held at a maintenance dose.",
 "Taper":"Cut volume about 25-40% while keeping a little half-marathon effort so legs feel fresh on race day.",
}

MOVES = [
 dict(pattern="Squat",session="A",
   bodyweight="Box/chair squat (sit to a sturdy chair and stand) -> bodyweight squat -> tempo squat (3 s down)",
   dumbbell="Goblet squat holding one dumbbell at the chest",
   kettlebell="Kettlebell goblet squat (hold the bell by the horns)",
   beginner="Start with box squat; move to free squat once 2 x 12 feels RPE 5.",
   average="Goblet squat with load; bodyweight-only users use tempo or 1.5-rep squats."),
 dict(pattern="Hinge",session="A",
   bodyweight="Hip hinge drill (hands on hips, push hips back) -> single-leg RDL reach (fingertip on wall OK)",
   dumbbell="Dumbbell Romanian deadlift (two dumbbells)",
   kettlebell="Kettlebell deadlift (bell between feet) -> kettlebell Romanian deadlift",
   beginner="Learn the hinge with a flat back first; light load only.",
   average="RDL with load; in Build, a two-hand kettlebell swing (3 x 10-12) may replace the RDL if your hinge is solid."),
 dict(pattern="Lunge / split squat",session="B",
   bodyweight="Split squat holding a wall or chair -> reverse lunge",
   dumbbell="Dumbbell split squat -> dumbbell reverse lunge (dumbbells at sides)",
   kettlebell="Goblet split squat -> goblet reverse lunge",
   optional="Suspension straps: strap-assisted split squat or reverse lunge for balance (Beginner strength).",
   beginner="Stationary split squat with support; short range is fine at first.",
   average="Reverse lunge with load; in Build, rear-foot-elevated split squat (back foot on a bench/step) if you have one."),
 dict(pattern="Push (tied to the push-up test)",session="A and B",
   bodyweight="Push-up progression (see table below)",
   dumbbell="Dumbbell floor press (lying on floor) as a swap or second push exercise",
   kettlebell="Single-arm kettlebell floor press",
   optional="Suspension straps: strap push-up / chest press (more upright = easier) as an incline option.",
   beginner="Use the incline level that matches your test score.",
   average="Floor push-ups; progress with tempo, pauses or feet elevated."),
 dict(pattern="Row / pull",session="A and B",
   bodyweight="Prone Y-T raises on the floor (thumbs up, squeeze shoulder blades)",
   dumbbell="One-arm dumbbell row with a hand on a bench or sturdy chair",
   kettlebell="One-arm kettlebell row or band row -> (Average) kettlebell gorilla row with two bells",
   optional="Suspension straps: inverted row (more upright = easier). Doorway pull-up bar: dead hang 20-30 s, band-assisted pull-up or slow negatives (Beginner strength), pull-ups or chin-ups for sets of 3-6 (Average strength).",
   beginner="Light load, pause 1 s at the top.",
   average="Heavier rows, 6-8 reps in Build."),
 dict(pattern="Calf / foot",session="A (straight-knee) and B (bent-knee + balance)",
   bodyweight="Double-leg calf raise -> single-leg calf raise off a step (2 s up, 2 s down); bent-knee calf raise; single-leg balance 30 s",
   dumbbell="Same, holding a dumbbell in one hand (other hand on a wall)",
   kettlebell="Same, holding a kettlebell; balance on a folded mat for challenge",
   beginner="Double-leg first, slow lowering. Calves always use higher reps (12-20).",
   average="Single-leg from Week 1; add load in Build."),
 dict(pattern="Core anti-rotation",session="A",
   bodyweight="Bird dog (slow, 2 s hold) -> plank shoulder taps (feet wide)",
   dumbbell="Suitcase hold or suitcase carry (one dumbbell, walk tall without leaning)",
   kettlebell="Kettlebell suitcase carry; long band: half-kneeling Pallof press",
   beginner="Bird dog or suitcase hold.",
   average="Shoulder taps, heavier carries, or plank pull-through (drag a dumbbell/kettlebell under the body)."),
 dict(pattern="Hip stability - glute bridge",session="B",
   bodyweight="Glute bridge -> single-leg glute bridge",
   dumbbell="Glute bridge with a dumbbell on the hips",
   kettlebell="Glute bridge with a kettlebell on the hips; mini-band around knees option",
   beginner="Two-leg bridge, 2 s squeeze at the top.",
   average="Single-leg bridge, or loaded hip thrust with shoulders on a bench."),
 dict(pattern="Hip stability - side plank",session="B",
   bodyweight="Side plank from knees -> full side plank -> side plank with top-leg lift",
   dumbbell="Same (no load needed); swap: side-lying hip abduction",
   kettlebell="Same; mini-band: lateral band walk as a swap",
   optional="Foam roller is optional for easy rolling after runs; it does not replace strength work.",
   beginner="Knee side plank, build to 30 s.",
   average="Full side plank, add top-leg lift in Build."),
]
PUSH_PROG = [
 dict(level="Beginner",score="0-2",exercise="Incline push-up, hands on a kitchen counter",notes="Body straight; progress to a lower surface when you hit the top of the rep range at RPE 6."),
 dict(level="Beginner",score="3-5",exercise="Incline push-up, hands on a sturdy bench or chair (against a wall)",notes="Add 1 set of 2-3 floor push-up negatives (lower over 3-5 s) in Build."),
 dict(level="Beginner",score="6-7",exercise="Low incline push-up (step or low box) + floor negatives",notes="Finish each push set with 2-3 floor reps or slow negatives."),
 dict(level="Average",score="8-14",exercise="Floor push-ups",notes="Sets of about 50-60% of your test max (e.g., max 10 -> sets of 5-6)."),
 dict(level="Average",score="15-24",exercise="Tempo floor push-ups (3 s down) or 1 s pause at the bottom",notes="Sets of about 50% of max at RPE 7."),
 dict(level="Average",score="25+",exercise="Feet-elevated push-ups (feet on a step) or push-ups on dumbbell/kettlebell handles for range",notes="6-10 reps per set at RPE 7."),
]
DOSE = [
 dict(phase="Base",frequency="2x/week (A Mon, B Thu); cutback weeks: A only",
      beginner="2 sets x 10 reps (holds 2 x 20 s; carries 2 x 30 s per side; calves 2 x 12-15). RPE 5-6 (4+ reps left). Rest 45-60 s.",
      average="2-3 sets x 10 reps (holds 2-3 x 30 s; carries 2-3 x 40 s per side; calves 2 x 15). RPE 6. Rest 60 s."),
 dict(phase="Build",frequency="2x/week; cutback weeks: A only, 1 fewer set",
      beginner="3 sets x 8-10 reps (holds 3 x 30 s; calves 3 x 12-15). RPE 6-7 (3 reps left). Add load or a harder version when the top of the range feels easy.",
      average="3 sets x 6-8 reps with heavier load (holds 3 x 40 s; calves 3 x 12-15 single-leg). RPE 7 (2-3 reps left). Rest 60-90 s."),
 dict(phase="Peak (maintain)",frequency="1-2x/week (A required, B optional)",
      beginner="2 sets x 8 reps at the same load as late Build. RPE 6.",
      average="2 sets x 6 reps at the same load as late Build. RPE 7. Do not chase new maxes."),
 dict(phase="Taper",frequency="Taper week 1: A only, light. Race week: no strength (optional 10 min mobility)",
      beginner="1-2 sets x 6-8 reps, RPE 5. Nothing new.",
      average="1-2 sets x 6 reps, RPE 5. Nothing new."),
]
STRENGTH_SESSIONS = dict(
 warmup="5 min: marching or easy jog in place 1 min, leg swings 10/side, hip circles 5/side, inchworm 5, glute bridge 10.",
 A=["A1 Squat","A2 Row","B-pair: Hinge + Push","C-pair: Calf raise (straight-knee) + Core anti-rotation"],
 B=["A1 Lunge / split squat","A2 Push (variation or floor press)","B-pair: Row + Glute bridge","C-pair: Side plank + Bent-knee calf raise / single-leg balance"],
 format="Do each pair back-to-back, rest, repeat for the prescribed sets. Total 20-30 min including warm-up.",
 placement="Mon and Thu (non-consecutive, and at least 48 h before the Saturday long run). On Thu, do strength after the easy run or later the same day. If you move days, keep strength off the day before the long run.",
)
NOTES = dict(
 missed_workouts=[
  "Missed 1-2 days: carry on with the plan; don't cram missed runs into the next days.",
  "Short on time this week: priority is long run > workout > easy run > recovery run > strength B.",
  "Missed a whole week: repeat the last week you completed, then continue.",
  "Missed 2+ weeks (or returning from illness): go back 2 weeks, keep everything easy for the first few runs, and consider a later race if you lose more than 3 weeks. Never double the long run to catch up.",
  "Feeling unwell or unusually tired: swap the workout for an easy run or take a rest day. With fever or chest symptoms, rest and check with a doctor before running."],
 heat_altitude_utah=[
  "Altitude: much of Utah sits around 4,000-7,000+ ft. Above about 5,000 ft, expect the same effort to feel harder and paces to be slower, especially in the first 2-3 weeks or when traveling higher. Run by RPE and the talk test, not pace.",
  "Dry air: you lose more fluid through breathing than you notice. Carry water on runs over 45-60 min and drink to thirst before and after.",
  "Heat (summer, and lower-elevation areas like southern Utah): run early morning or evening, slow down, take walk breaks in the shade, wear light clothing, sunscreen and a hat. Cut the run short if you feel dizzy, nauseated, confused or stop sweating.",
  "Winter and inversion/smoke days: on poor air-quality days, move runs indoors or shorten them. On ice, choose safer routes or a treadmill.",
  "If your race is at a different elevation than where you train, plan an easier start and run by effort on race day."],
 fueling_long_runs=[
  "Habit 1 - pre-run: eat a familiar, easy-to-digest snack or meal 1-3 h before long runs (something with carbohydrates you know sits well).",
  "Habit 2 - during: for runs longer than about 60-75 min, practice taking carbohydrates (gel, chews or sports drink) about every 30-45 min, starting around 30-45 min in. Train your gut on every long run of 6+ mi.",
  "Habit 3 - fluids: sip regularly and drink to thirst; in heat or dry air add electrolytes on longer runs.",
  "Habit 4 - after: within about an hour, have a normal meal or snack with carbohydrates and protein, plus fluids.",
  "Habit 5 - race day: nothing new. Use the breakfast, fuel, drink, shoes and clothes you practiced on your last 2-3 long runs.",
  "This is general guidance, not a meal plan. If you have diabetes, digestive conditions or other medical needs, work with your doctor or a registered dietitian."],
 shoes_and_warning_signs=[
  "Run in comfortable, well-fitting running shoes; most pairs last roughly 300-500 mi (480-800 km). Replace them when the cushioning feels flat or new aches appear with no other change. Avoid brand-new shoes on race day; break them in over 2-3 weeks.",
  "Normal: general muscle soreness that fades within 1-2 days and doesn't change how you run.",
  "Warning signs - stop the run and rest: pain that makes you limp or change your stride; pain that gets worse as you run; sharp or pinpoint pain on a bone; swelling, numbness or tingling; pain that wakes you at night or lasts more than 2-3 days.",
  "If a warning sign appears, take 2-3 days off running (walking and upper-body strength are OK if pain-free). If it hasn't clearly improved, see a qualified healthcare provider. This plan cannot diagnose pain or injuries."],
 retest=[
  "Optional: on Monday of a cutback week (Beginner run plan Weeks 4, 8, 12; Average run plan Weeks 4 and 8), redo the max floor push-up test before Strength A, and do the continuous-run check in place of that week's Thursday easy run (stop at 45 min or at the easy run's planned minutes + 10, whichever is shorter).",
  "Strength level changes apply right away: if a Beginner-strength athlete scores 8+, switch to the Average strength doses and push-up progression; if a score drops below 8, it's fine to stay or step back.",
  "Run level changes only apply when you start a new plan. Never switch running plans mid-way; finish the plan you started (or pause it) and use the new run level for the next one.",
  "Use the newest push-up score to pick your push-up level from the table."],
)
ASSUMPTIONS = [
 "Weekly volume is tracked as estimated run minutes: easy/workout/recovery minutes as written plus long-run miles x an assumed pace (Beginner run level 13:00 min/mi, Average run level 11:00 min/mi). The ~10% rule is checked against the highest previous non-cutback week; cutback and taper weeks are deliberate drops, and race week is excluded (the race is the event).",
 "Race-week estimates assume race pace of 12:00 min/mi (Beginner) and 10:00 min/mi (Average) for display only.",
 "Standard week: Mon Strength A, Tue Workout, Wed Rest, Thu Easy (+ Strength B), Fri Rest (3-day) or Recovery run (4-day), Sat Long run, Sun Rest. Day names are suggestions; keep the order and spacing.",
 "Run level and strength level are independent. Plan names (Beginner/Average, 16/12 weeks) refer to RUN level; strength tables have separate Beginner-strength and Average-strength columns.",
 "Equipment 'kettlebells and essentials' = the approved essentials kit: dumbbells, kettlebell(s), mini-band, long resistance band, sturdy step or bench, mat. Optional extras (foam roller, doorway pull-up bar, TRX/suspension straps) only add alternatives; nothing in the plan requires them.",
 "Continuous-run check is capped at 45 min (40+ is all that matters for leveling). Someone under 20 min continuous who can complete 30 min of run-walk is Beginner; the question route has no run-walk item, so <20 min there routes to the 5K track.",
 "During a retest, the run check replaces that week's Thursday easy run; this can add up to about 10 min in a cutback week, which stays well below the surrounding build weeks.",
 "Conversions use 1 mi = 1.609344 km, rounded to 0.1 km.",
]

WORKOUT_LIB=[]
for level,P in (("Beginner",BEG),("Average",AVG)):
    for w in P["workouts"]:
        WORKOUT_LIB.append(dict(id=w[1],level=level,week=w[0],phase=P["phase"](w[0]),name=w[2],total_min=w[3]+w[5]+w[6],
            warmup_min=w[3],main=w[4],main_min=w[5],cooldown_min=w[6],effort_rpe=w[7],talk_test=w[8]))
WORKOUT_GUIDE = [
 "Hills: choose a moderate grade (you can still run tall). Run up strong at RPE 7-8 with quick, short steps; walk or jog down slowly. No hills? Use the same timing on flat ground at RPE 7, or a treadmill at 4-6% incline.",
 "Fartlek: 'speed play' - surge at the stated effort for the stated time, then truly easy. Use time, not landmarks.",
 "Steady / tempo / cruise: smooth and controlled; you should finish feeling you could do one more rep.",
 "Half-marathon effort segments: rehearse goal race effort (RPE 6, short phrases) and practice relaxed form.",
 "Recoveries are part of the workout: keep them easy (jog or walk).",
 "If a workout feels much harder than the listed RPE, cut the remaining reps and jog easy. Never move the workout to the day before or after the long run.",
]

DATA = dict(meta=META,disclaimer=DISCLAIMER,prerequisites=PREREQ,effort_guide=dict(scale=EFFORT,notes=EFFORT_NOTES),
  phases=PHASE_INFO, plans=PLANS, workout_library=dict(guidelines=WORKOUT_GUIDE,workouts=WORKOUT_LIB),
  strength=dict(sessions=STRENGTH_SESSIONS,movements=MOVES,pushup_progression=PUSH_PROG,phase_dosing=DOSE),
  notes=NOTES, assumptions=ASSUMPTIONS)
with open("/workspace/doing-a-5k/half-marathon-plan.json","w") as f: json.dump(DATA,f,indent=2,ensure_ascii=False)

# ---------------- Markdown ----------------
L=[]; a=L.append
a("# Doing a 5K - Half Marathon Plan (13.1 mi / 21.1 km)\n")
a("*Coach Salim Heyaime LLC - Doing a 5K app, half-marathon goal track. Version 2.0 (Oct 2026).*\n")
a("> **Important:** "+DISCLAIMER+"\n")
a("## How it works\n")
a("1. **Choose your goal:** half marathon (this plan).\n2. **Choose your days:** 3 or 4 running days per week, plus 1-2 short strength sessions.\n3. **Choose your equipment:** none / dumbbells / kettlebells and essentials. Every strength movement has all three options.\n   - *Essentials kit:* dumbbells, kettlebell(s), mini-band, long resistance band, sturdy step or bench, mat.\n   - *Optional extras:* foam roller, doorway pull-up bar, TRX/suspension straps (unlock pull-up and inverted-row options).\n4. **Set your RUN level** (picks the plan): continuous-run check, or answer two questions.\n5. **Set your STRENGTH level** (picks strength doses and push-up progression): max floor push-up test.\n")
a("Run level and strength level are set **separately**; any combination is valid (e.g., Beginner run + Average strength).\n")
a("### Run level - option A: continuous-run check\n\n"+RUNCHECK_RULES+" Then answer: are you running about 3 days a week now, and have you run 4 mi (6.4 km) or more in the past month?\n")
a("| Result | Run level | Plan |\n|---|---|---|\n| Under 20 min continuous (and can't do 30 min of run-walk) | Not ready | Finish the 5K track first |\n| 20-39 min continuous, OR 30 min of run-walk | Beginner | 16 weeks |\n| 40+ min continuous, but not running ~3x/week or no recent 4 mi run | Beginner | 16 weeks |\n| 40+ min continuous AND running ~3x/week AND a 4 mi (6.4 km) run recently | Average | 12 weeks |\n")
a("### Run level - option B: no-test questions\n\n- *How long can you run without stopping?* <20 / 20-39 / 40+ min\n- *How many days a week do you run now?* 0-1 / 2 / 3+\n")
a("| Run without stopping | Days/week now | Run level | Plan |\n|---|---|---|---|\n| <20 min | any | Not ready | Finish the 5K track first |\n| 20-39 min | any | Beginner | 16 weeks |\n| 40+ min | 0-1 or 2 | Beginner | 16 weeks |\n| 40+ min | 3+ | Average | 12 weeks |\n")
a("### Strength level: max floor push-up test\n\n"+PUSHUP_RULES+"\n")
a("| Push-ups (floor, no knees) | Strength level |\n|---|---|\n| 0-7 | Beginner strength |\n| 8+ | Average strength |\n")
a("## 1. Prerequisites / readiness\n")
a("**Everyone:**\n"); [a(f"- {x}") for x in PREREQ["all"]]; a("")
a("**Not ready yet:**\n"); [a(f"- {x}") for x in PREREQ["not_ready"]]; a("")
a("**Beginner run level (16 weeks):**\n"); [a(f"- {x}") for x in PREREQ["beginner"]]; a("")
a("**Average run level (12 weeks):**\n"); [a(f"- {x}") for x in PREREQ["average"]]; a("")
a("## 2. Effort guide (RPE + talk test)\n")
a("| RPE | Name | Talk test | Used for |\n|---|---|---|---|")
for e in EFFORT: a(f"| {e['rpe']} | {e['label']} | {e['talk_test']} | {e['used_for']} |")
a(""); [a(f"- {x}") for x in EFFORT_NOTES]; a("")
a("## 3. Week-by-week plans\n")
a("**Standard week:** Mon Strength A - Tue Workout - Wed Rest - Thu Easy run (+ Strength B after) - Fri Rest (3-day) or Recovery run (4-day) - Sat Long run - Sun Rest. Days are suggestions: keep runs on non-consecutive days where possible (3-day), keep strength off the day before the long run, and keep 2 easy days between hard efforts.\n")
a("**Warm-up / cool-down rules:** Workouts list their own warm-up (WU) and cool-down (CD), included in the total minutes. Easy and recovery runs: first 5 min extra-easy (or brisk walk), last 3-5 min easy to walking. Long runs: first 5-10 min slower than easy, 5 min walk after.\n")
a("**Phases:** "+" ".join(f"**{k}** - {v}" for k,v in PHASE_INFO.items())+"\n")
a("Est. min = estimated total weekly running minutes (see Assumptions). Change % = vs. the highest earlier non-cutback week.\n")
def wo_cell(s):
    return f"{s['duration_min']} min - {s['workout_id']} {s['name']}: WU {s['warmup'].split(' min')[0]} / {s['main'].rsplit(' (',1)[0]} / CD {s['cooldown'].split(' min')[0]} (RPE {s['effort_rpe']})"
for p in PLANS:
    four = p["days_per_week"]==4
    a(f"### {p['level']} run level - {p['days_per_week']} days/week ({p['weeks_total']} weeks)\n")
    a("*Use the strength doses for YOUR strength level (push-up test), which may differ from your run level.*\n")
    hdr="| Wk | Phase | Tue - Workout | Thu - Easy (RPE 3-4, full sentences) |"+(" Fri - Recovery (RPE 2-3) |" if four else "")+" Sat - Long run (RPE 3-4, full sentences) | Strength | Est. min | Change |"
    a(hdr); a("|"+"---|"*(hdr.count("|")-1))
    for wk in p["weeks"]:
        S={ (s["day_slot"],s["type"].split(" ")[0]):s for s in wk["sessions"]}
        tue=[s for s in wk["sessions"] if s["day_slot"]=="Tue"][0]
        thu=[s for s in wk["sessions"] if s["day_slot"]=="Thu" and s["type"]!="strength"][0]
        sat=[s for s in wk["sessions"] if s["day_slot"]=="Sat"][0]
        ph = (f"**{wk['flag'].upper()}**" if wk["flag"] and wk["flag"].startswith("Taper") else wk["phase"]+ (f" - **{wk['flag'].upper()}**" if wk["flag"] else ""))
        thu_c = f"{thu['duration_min']} min {thu['type']}"
        if sat["type"]=="race":
            sat_c="**RACE: 13.1 mi / 21.1 km** (RPE 5-6 early, up to 7 in last 5K)"
        else:
            sat_c=f"{sat['distance_mi']:g} mi / {sat['distance_km']} km"
        row=f"| {wk['week']} | {ph} | {wo_cell(tue)} | {thu_c} |"
        if four:
            fri=[s for s in wk["sessions"] if s["day_slot"]=="Fri"][0]
            row+=f" {fri['duration_min']} min{' shakeout + 3 strides' if sat['type']=='race' else ''} |"
        pc=wk.get("pct_vs_prior_peak_week")
        chg = "race week" if sat["type"]=="race" else (f"{pc:+.1f}%" if pc is not None else "start")
        row+=f" {sat_c} | {wk['strength']} | {wk['est_total_run_minutes']} | {chg} |"
        a(row)
    a("")
    peak=max(w["long_run_mi"] for w in p["weeks"] if w["flag"]!="Taper / Race")
    pk=max(p["weeks"][:-1],key=lambda w:w["est_total_run_minutes"])
    a(f"*Peak long run: {peak:g} mi / {km(peak)} km. Peak week: Week {pk['week']}, about {pk['est_total_run_minutes']} min of running.*")
    if p["level"]=="Beginner": a("*Run-walk is always allowed on long runs; it is also allowed on easy runs in Weeks 1-4.*")
    else: a("*Weeks 7 and 9 long runs: optional last 1-2 mi (1.6-3.2 km) at steady RPE 5-6 only if you feel good.*")
    a("*Race week: Mon optional mobility only, Tue shakeout, Thu short easy run, "+("Fri 15 min shakeout with 3 relaxed strides, " if four else "Fri rest (optional 10 min walk + 3 relaxed strides), ")+"Sat race, Sun rest/walk.*\n")
a("## 4. Workout library by phase\n")
[a(f"- {x}") for x in WORKOUT_GUIDE]; a("")
for level in ("Beginner","Average"):
    a(f"### {level} workouts\n")
    a("| ID | Wk | Phase | Workout | Warm-up | Main set | Cool-down | Total | Effort (RPE) | Talk test |\n|---|---|---|---|---|---|---|---|---|---|")
    for w in WORKOUT_LIB:
        if w["level"]==level:
            a(f"| {w['id']} | {w['week']} | {w['phase']} | {w['name']} | {w['warmup_min']} min easy | {w['main']} ({w['main_min']} min) | {w['cooldown_min']} min easy | {w['total_min']} min | {w['effort_rpe']} | {w['talk_test']} |")
    a("")
a("## 5. Strength progressions (20-30 min, 1-2x/week)\n")
a(f"**Placement:** {STRENGTH_SESSIONS['placement']}\n")
a(f"**Warm-up:** {STRENGTH_SESSIONS['warmup']}\n")
a(f"**Strength A:** {'; '.join(STRENGTH_SESSIONS['A'])}.  \n**Strength B:** {'; '.join(STRENGTH_SESSIONS['B'])}.  \n{STRENGTH_SESSIONS['format']}\n")
a("Strength phases follow the run plan you are on (Base/Build/Peak/Taper dates come from your run plan); doses come from your strength level.\n")
a("### Phase dosing\n\n| Phase | Frequency | Beginner strength (0-7 push-ups) | Average strength (8+ push-ups) |\n|---|---|---|---|")
for d in DOSE: a(f"| {d['phase']} | {d['frequency']} | {d['beginner']} | {d['average']} |")
a("\n*RPE in strength = how hard the set feels; RPE 6 is about 4 reps left in the tank, RPE 7 about 3, RPE 8 about 2. Stop a set if form breaks or anything hurts (not just effort).*\n")
a("### Movements and equipment swaps\n\n| Movement | Session | No equipment | Dumbbells | Kettlebells + essentials | Optional extras | Beginner strength | Average strength |\n|---|---|---|---|---|---|---|---|")
for m in MOVES: a(f"| {m['pattern']} | {m['session']} | {m['bodyweight']} | {m['dumbbell']} | {m['kettlebell']} | {m.get('optional','-')} | {m['beginner']} | {m['average']} |")
a("\n### Push-up progression (from your test score)\n\n| Strength level | Test score | Exercise | Notes |\n|---|---|---|---|")
for x in PUSH_PROG: a(f"| {x['level']} | {x['score']} | {x['exercise']} | {x['notes']} |")
a("")
a("## 6. Notes\n")
for title,key in [("Missed workouts","missed_workouts"),("Heat and altitude (Utah)","heat_altitude_utah"),("Fueling basics for long runs","fueling_long_runs"),("Shoes and injury warning signs","shoes_and_warning_signs"),("Optional retest (cutback weeks)","retest")]:
    a(f"### {title}\n"); [a(f"- {x}") for x in NOTES[key]]; a("")
a("## Assumptions\n"); [a(f"- {x}") for x in ASSUMPTIONS]; a("")
a("---\n*General education only, not medical advice. Coach Salim Heyaime LLC.*")
open("/workspace/doing-a-5k/half-marathon-plan.md","w").write("\n".join(L)+"\n")
print("ok")
