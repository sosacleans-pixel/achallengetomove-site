#!/usr/bin/env python3
"""Doing a 5K ladder v6 (Coach Fit, Nov 22, 2026, 7:13 PM MT decisions). DRAFT for Salim's approval. Nothing live.
Levels: A Challenge to Move: Walk to 5K (walk-to-5k), A Challenge to Move: 5K Faster (5k-faster), A Challenge to Move: 10K (10k).
Each level = 36 CORE sessions (anchor: 3 days/wk x 12 wk). Days a week sets plan length:
  2/wk = 18 wk, 36 sessions | 3/wk = 12 wk, 36 | 4/wk = 10 wk, 40 (36 core + 4 easy) | 5/wk = 9 wk, 45 (36 core + 9 easy)
Same step format as PR #1 (type, label, durationSeconds, phase, effort, cue). New: '10k-open' step (count-up, cap 90:00).
Run: python3 gen_ladder_v6.py   (writes 12 level files + index.json + weekly-tables.md, then validates)"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))

def t(s): m, s2 = s.split(":"); return int(m) * 60 + int(s2)
def mmss(sec): return f"{sec//60}:{sec%60:02d}"
def step(type_, label, dur, effort="", cue=None, phase="main"):
    d = {"type": type_, "label": label, "durationSeconds": dur, "phase": phase}
    if effort: d["effort"] = effort
    if cue: d["cue"] = cue
    return d
WALK="Brisk, RPE 3"; JOG="RPE 4, full sentences"; EASY="Easy, RPE 3 to 4, full sentences"
STRIDE="Quick and smooth, RPE 7, not a sprint"; BRISK="Brisk, RPE 6 to 7, short phrases"
STEADY="Steady, RPE 6, short phrases"; TEMPO="Tempo, RPE 6 to 7, short phrases"; CRUISE="Cruise, RPE 7, short phrases"
UP="Uphill, RPE 7 to 8, a few words at the top"; FIVEK_EFF="5K effort, RPE 7, short phrases"; RECOV="Very easy, RPE 2 to 3"

def wu_walk(): return [step("walk","Warm-up brisk walk",300,WALK,phase="warmup")]
def wu_walk_jog(j=180): return wu_walk()+[step("easy","Warm-up easy jog",j,EASY,"run","warmup")]
def wu_q():
    s = wu_walk_jog(300)
    for _ in range(2): s += [step("stride","Warm-up stride",15,STRIDE,"run","warmup"), step("walk","Walk back",45,"Easy",phase="warmup")]
    return s
def cd_walk(): return [step("walk","Cool-down walk",300,"Easy walk","cooldown","cooldown")]
def cd_q(): return [step("easy","Cool-down easy jog",300,"Easy","run","cooldown"), step("walk","Cool-down walk",180,"Easy walk","cooldown","cooldown")]
def reps(n,a,b):
    out=[]
    for _ in range(n): out += [dict(a), dict(b)]
    return out
def strides(n,on=20,back=70): return reps(n, step("stride","Stride",on,STRIDE,"run"), step("walk","Walk-jog back",back,"Easy"))
def open5k(cap=2700): return step("5k-open","Your 5K, go at your pace",cap,"","run")   # cap 60:00 Walk to 5K, 45:00 5K Faster (Salim, Nov 22, 2026, 8:38 PM MT)
def open10k(): return step("10k-open","Your 10K, go at your pace",5400,"","run")   # cap 90:00 (decided)

def sess(title, summary, warm, main, cool, kind, reuse, key=False, **extra):
    steps = warm+main+cool
    d = {"title":title,"summary":summary,"kind":kind,"key":key,"reuse":reuse,"steps":steps}
    d.update(extra)
    d["mainSeconds"]=sum(s["durationSeconds"] for s in steps if s["phase"]=="main")
    d["totalSeconds"]=sum(s["durationSeconds"] for s in steps)
    return d

# ============ Level 1: Walk to 5K (walker -> continuous 5K) ============
def W(spec):
    if spec[0]=="R":
        _,n,j,w = spec
        return reps(n, step("run","Easy jog",t(j),JOG), step("walk","Brisk walk",t(w),WALK)), f"{n} x ({j} jog / {w} walk)", n*t(j), t(j)
    if spec[0]=="S":
        main,parts,jt,lj=[],[],0,0
        for k,v in spec[1]:
            if k=="j": main.append(step("run","Easy jog",t(v),JOG)); parts.append(f"{v} jog"); jt+=t(v); lj=max(lj,t(v))
            else: main.append(step("walk","Walk",t(v),WALK)); parts.append(f"{v} walk")
        return main," / ".join(parts),jt,lj
    _,v = spec
    return [step("run","Continuous easy jog",t(v),JOG)], f"{v} continuous easy jog", t(v), t(v)
R=lambda n,j,w:("R",n,j,w); C=lambda v:("C",v)
L1 = {  # anchor week: [S1,S2,S3]
 1:[R(6,"0:45","2:15"),R(7,"0:45","2:00"),R(8,"1:00","1:30")],
 2:[R(8,"1:00","1:30"),R(6,"1:30","2:00"),R(6,"1:30","1:30")],
 3:[R(5,"2:00","1:30"),R(5,"2:30","1:30"),R(4,"3:00","1:30")],
 4:[R(4,"3:00","1:30"),R(5,"2:30","1:30"),R(4,"3:00","1:30")],          # lighter (hold)
 5:[R(4,"4:00","1:30"),R(3,"5:00","1:30"),R(3,"5:00","1:00")],
 6:[R(3,"6:00","1:00"),R(2,"8:00","1:30"),R(2,"9:00","1:30")],
 7:[R(2,"10:00","1:30"),("S",[("j","12:00"),("w","1:00"),("j","6:00")]),C("15:00")],
 8:[R(2,"8:00","1:00"),C("15:00"),R(2,"10:00","1:00")],                 # lighter
 9:[C("18:00"),R(2,"10:00","1:00"),C("20:00")],
 10:[C("22:00"),R(2,"12:00","1:00"),C("25:00")],
 11:[C("20:00"),C("25:00"),"FIRST5K"],
 12:[C("20:00"),C("15:00"),"CHECK5K"],
}
L1_REUSE={1:"v5 L1 wk1-3 (faster)",2:"v5 L1 wk3-5",3:"v5 L1 wk6-7",4:"v5 L1 wk7 (hold)",5:"v5 L1 wk8",
          6:"v5 L1 wk9-10",7:"v5 L1 wk11-12 + v5 L2 wk1",8:"v5 L2 wk1-2 (lighter)",9:"v5 L2 wk4-5",10:"v5 L2 wk6-8",11:"v5 L2 wk10-11",12:"v5 L2 wk12"}
def l1_core(w):
    out=[]
    for i,spec in enumerate(L1[w],1):
        if spec in ("FIRST5K","CHECK5K"):
            first = spec=="FIRST5K"
            eff = "Easy and steady, RPE 4 to 5, walk breaks OK" if first else "Comfortably steady, RPE 5 to 6"
            out.append(sess("Your first continuous 5K" if first else "5K check-in",
                f"Count-up timer, tap Finish at 5K (auto-stops 60:00). {eff}.", wu_walk(), [open5k(3600)], cd_walk(),
                "5K", "v5 L2 wk10/12 + 5k-open timer", key=True, fiveK=True, openTimer={"distance":"5K","capSeconds":3600}, fiveKEffort=eff,
                **({} if first else {"checkin":"final"})))
            continue
        main,summ,jt,lj = W(spec)
        title = "Walk with jogs" if w<=3 else ("Run / walk" if w<=6 else "Build endurance")
        if w in (4,8): title += " (lighter week)"
        out.append(sess(title, summ+".", wu_walk(), main, cd_walk(), "Core", L1_REUSE[w], key=(lj>=t("20:00"))))
    if w==1: out[0]["checkin"]="day1"
    return out
def l1_extra(_w):
    return sess("Easy movement","25:00 brisk walk, easy cycling, or gentle mobility.", wu_walk(),
                [step("walk","Brisk walk, easy cycling or mobility",1500,WALK)], cd_walk(), "Easy extra", "New (non-running day)")

# ============ Level 2: 5K Faster (old Faster 5K) ============
Q2 = {
 2:("Fartlek intro",6,30,"brisk","Brisk",BRISK,90,"Easy jog or walk","easy","B1"),
 3:("Fartlek",8,45,"brisk","Brisk",BRISK,75,"Easy jog","easy","B3"),
 4:("Hill intro",6,30,"uphill","Uphill",UP,90,"Walk-jog down","downhill-recovery","B5"),
 5:("Steady intro",3,240,"steady","Steady",STEADY,120,"Easy jog","easy","B6"),
 6:("Fartlek",8,60,"brisk","Brisk","Brisk, RPE 7, short phrases to a few words",60,"Easy jog","easy","B8 / A1"),
 7:("Hill repeats",8,45,"uphill","Uphill","Uphill, RPE 8, a few words",90,"Walk-jog down","downhill-recovery","B9 / A2"),
 8:("Steady",3,300,"steady","Steady","Steady, RPE 6 to 7, short phrases",120,"Easy jog","easy","B7"),
 9:("Tempo",2,480,"tempo","Tempo",TEMPO,180,"Easy jog","easy","B10"),
 10:("Cruise intervals",4,240,"tempo","Cruise",CRUISE,120,"Easy jog","easy","B11"),
 12:("5K sharpener",5,120,"tempo","5K effort",FIVEK_EFF,120,"Easy jog","easy","New"),
}
def qsess(spec, prefix="⚡ "):
    name,n,on,typ,onl,one,off,offl,offt,src = spec
    main = reps(n, step(typ,onl,on,one,"run"), step(offt,offl,off,"Easy" if offt=="easy" else "Easy, walk or jog down"))
    return sess(prefix+name, f"{n} x ({mmss(on)} {onl.lower()} / {mmss(off)} {offl.lower()}).", wu_q(), main, cd_q(), "Q", src, key=True, q=True)
def easy_s(m,k=0,title="Easy",reuse="Generic easy"):
    main=[step("easy","Easy run",m*60,EASY,"run")]+(strides(k) if k else [])
    summ=f"{m}:00 easy"+(f" + {k} strides (0:20 quick / 1:10 walk-jog back)" if k else "")
    return sess(title+(" + strides" if k else ""), summ+".", wu_walk_jog(180), main, cd_walk(), "Core", reuse+(" + B4/A4 strides" if k else ""))
def long_s(m, reuse="Generic long easy"):
    return sess("Long easy", f"{m}:00 easy.", wu_walk_jog(180), [step("easy","Long easy run",m*60,EASY,"run")], cd_walk(), "Core", reuse, key=True)
L2_EL={1:(25,0,30),2:(25,4,32),3:(25,0,34),4:(20,4,30),5:(25,0,36),6:(25,6,38),7:(28,0,40),8:(20,4,32),9:(25,0,38),10:(25,6,40),11:(25,0,35),12:(15,4,None)}
def l2_core(w):
    if w==1:
        eff="Comfortably hard, RPE 6 to 7"
        s1=sess("⚡ Baseline 5K",f"Count-up timer, tap Finish at 5K (auto-stops 45:00). {eff}.",wu_q(),[open5k()],cd_q(),"Trial","v5 L3 wk1",key=True,q=True,fiveK=True,openTimer={"distance":"5K","capSeconds":2700},fiveKEffort=eff,checkin="day1")
    elif w==11:
        s1=sess("⚡ Continuous tempo","15:00 continuous tempo, RPE 6 to 7.",wu_q(),[step("tempo","Tempo",900,TEMPO,"run")],cd_q(),"Q","A7 (15:00)",key=True,q=True)
    else: s1=qsess(Q2[w])
    e,k,l=L2_EL[w]
    s2=easy_s(e,k,"Shakeout" if w==12 else "Easy")
    if w==12:
        eff="Comfortably hard, RPE 7 late"
        s3=sess("⚡ 5K time trial",f"Count-up timer, tap Finish at 5K (auto-stops 45:00). {eff}. Compare with your first session.",wu_q(),[open5k()],cd_q(),"Trial","v5 L3 wk12",key=True,q=True,fiveK=True,openTimer={"distance":"5K","capSeconds":2700},fiveKEffort=eff,checkin="final")
    else: s3=long_s(l)
    return [s1,s2,s3]
def recov_extra(_w):
    return sess("Recovery","20:00 very easy jog, or 25:00 brisk walk, easy cycling or mobility.",wu_walk(),[step("easy","Recovery jog or cross-train",1200,RECOV)],cd_walk(),"Easy extra","New")

# ============ Level 3: 10K (new) ============
Q3 = {
 2:("Steady",3,300,"steady","Steady",STEADY,120,"Easy jog","easy","B7"),
 4:("Fartlek",8,60,"brisk","Brisk","Brisk, RPE 7, short phrases",60,"Easy jog","easy","B8 / A1"),
 5:("Tempo",2,480,"tempo","Tempo",TEMPO,180,"Easy jog","easy","B10"),
 7:("Cruise intervals",4,300,"tempo","Cruise",CRUISE,60,"Easy jog","easy","A5"),
 10:("Steady",3,480,"steady","Steady",STEADY,120,"Easy jog","easy","New"),
 11:("Tempo",2,600,"tempo","Tempo",TEMPO,180,"Easy jog","easy","New (B14 pattern)"),
}
L3_S1_EASY={1:(25,4),3:(30,6),6:(30,6),8:(30,4),12:(25,4)}
L3_E={1:30,2:30,3:30,4:25,5:35,6:35,7:35,8:30,9:35,10:40,11:35,12:20}
L3_L={1:40,2:45,3:50,4:40,5:55,6:60,7:65,8:50,9:70,10:75,11:60}
def l3_core(w):
    if w in Q3: s1=qsess(Q3[w])
    elif w==9: s1=sess("⚡ Continuous tempo","20:00 continuous tempo, RPE 6 to 7.",wu_q(),[step("tempo","Tempo",1200,TEMPO,"run")],cd_q(),"Q","A7",key=True,q=True)
    else:
        m,k=L3_S1_EASY[w]; s1=easy_s(m,k,"Easy","New")
    if w==1: s1["checkin"]="day1"
    s2=easy_s(L3_E[w],0,"Shakeout" if w==12 else "Easy","New")
    if w==12:
        eff="Comfortably steady, RPE 5 to 6, walk breaks OK"
        s3=sess("10K check-in",f"Count-up timer, tap Finish at 10K (auto-stops 90:00). {eff}.",wu_walk_jog(180),[open10k()],cd_walk(),"10K","New + 10k-open timer",key=True,tenK=True,openTimer={"distance":"10K","capSeconds":5400},tenKEffort=eff,checkin="final")
    else:
        lt = "Long easy" + (" (lighter week)" if w in (4,8,11) else "")
        s3=long_s(L3_L[w],"New"); s3["title"]=lt
    return [s1,s2,s3]
def l3_extra(_w): return recov_extra(_w)

LEVELS=[
 dict(id="walk-to-5k",level=1,name="Walk to 5K",displayName="A Challenge to Move: Walk to 5K",price=6.99,core=l1_core,extra=l1_extra,
      entry="Can walk briskly for 30 minutes.",exit="A continuous 5K (about 30 minutes or more of nonstop easy running).",
      summary="Walk with short jogs, building to your first continuous 5K.",cues="Jogs are RPE 4, full sentences. Walks are brisk, RPE 3. Extra days are easy movement, never running.",
      spacing="max2RunDaysInARow"),
 dict(id="5k-faster",level=2,name="5K Faster",displayName="A Challenge to Move: 5K Faster",price=6.99,core=l2_core,extra=recov_extra,
      entry="Can run 5K, or 30 minutes, continuously.",exit="5K time trial versus your first session.",
      summary="Add speed play, hills and tempo runs for a smoother, quicker 5K.",cues="Key sessions are marked with a lightning bolt. Easy and Long days stay conversational.",
      spacing="noBackToBackKey"),
 dict(id="10k",level=3,name="10K",displayName="A Challenge to Move: 10K",price=6.99,core=l3_core,extra=l3_extra,
      entry="Can run 5K continuously and comfortably.",exit="A 10K check-in (about 60 to 75 minutes or more of easy, steady running).",
      summary="Build your long run from 40 minutes to a full 10K, with easy runs, strides and a few steady and tempo sessions.",
      cues="Key sessions are marked with a lightning bolt. Long runs stay conversational; walk breaks are always allowed.",
      spacing="noBackToBackKey"),
]
# plan shapes: list of weeks, each a list of 'C' (next core) / 'X' (easy extra)
def shape(d):
    if d==2: return [["C","C"]]*18
    if d==3: return [["C","C","C"]]*12
    if d==4:  # 10 weeks, 40 sessions: 6 full weeks (4 core) + 4 lighter weeks (3 core + 1 easy): weeks 3, 6, 9, 10
        cc=[4,4,3,4,4,3,4,4,3,3]; return [["C"]*4 if c==4 else ["C","C","X","C"] for c in cc]
    if d==5: return [["C","C","X","C","C"]]*9   # 9 weeks, 45 sessions: 4 core + 1 easy each week
WEEKS={2:18,3:12,4:10,5:9}
ACCESS_DAYS={2:140,3:98,4:84,5:77}   # plan length + 2 weeks: 20/14/12/11 weeks (decided)

# Default training days per frequency (0=Mon). The app suggests these; if the user picks other days, the engine
# re-applies the same rule (no key sessions on consecutive days; Walk to 5K: no 3 run days in a row) inside each week.
DEFAULT_DAYS={2:[1,5],3:[0,2,5],4:[0,1,3,5],5:[0,1,3,4,5]}
import itertools
def consecutive_pairs(d):
    dd=DEFAULT_DAYS[d]; return [(a,b) for a in range(len(dd)) for b in range(len(dd)) if dd[b]-dd[a]==1]
def arrange(items, d, level_id):
    pairs=consecutive_pairs(d); n=len(items)
    def ok(order, strict_runs=True):
        if order[-1].get("checkin")!="final" and any(x.get("checkin")=="final" for x in order): return False
        for a,b in pairs:
            if order[a]["key"] and order[b]["key"]: return False
        if strict_runs and level_id=="walk-to-5k":
            dd=DEFAULT_DAYS[d]
            for k in range(n-2):
                if dd[k+2]-dd[k]==2 and all(order[m]["core"] for m in (k,k+1,k+2)): return False
        return True
    best=None
    for strict in (True, False):
        for perm in itertools.permutations(range(n)):
            order=[items[k] for k in perm]
            if not ok(order, strict): continue
            cost=sum(abs(pos-k) for pos,k in enumerate(perm))
            if best is None or cost<best[0]: best=(cost,order)
        if best: return best[1]
    return items

index=[]; problems=[]
for L in LEVELS:
    core=[]
    for w in range(1,13):
        for k,s in enumerate(L["core"](w),1):
            s=json.loads(json.dumps(s)); s.update({"core":True,"coreIndex":len(core)+1,"anchorWeek":w,"anchorSession":k}); core.append(s)
    assert len(core)==36
    for d in (2,3,4,5):
        slots=[]; ci=0
        for wi,wk in enumerate(shape(d),1):
            items=[]
            for kind in wk:
                if kind=="C": items.append(json.loads(json.dumps(core[ci]))); ci+=1
                else:
                    x=json.loads(json.dumps(L["extra"](wi))); x.update({"core":False,"coreIndex":None,"key":False}); items.append(x)
            for j,s in enumerate(arrange(items,d,L["id"]),1):
                slots.append({"slot":len(slots)+1,"week":wi,"weekSession":j,**s})
        doc={k:L[k] for k in ("id","level","name","displayName","price","entry","exit","summary","cues","spacing")}
        doc.update({"priceStatus":"decided","daysPerWeek":d,"weeks":WEEKS[d],"totalSessions":len(slots),"coreSessions":36,
                    "accessDays":ACCESS_DAYS[d],"accessStatus":"decided (plan length + 2 weeks)",
                    "accessStarts":"purchase date (gift: redemption date)","slots":slots})
        fn=f"{L['id']}-{d}x.json"; json.dump(doc,open(os.path.join(HERE,fn),"w"),indent=1,ensure_ascii=False)
        index.append({"file":fn,"id":L["id"],"displayName":L["displayName"],"level":L["level"],"daysPerWeek":d,"weeks":WEEKS[d],"totalSessions":len(slots),"accessDays":ACCESS_DAYS[d]})
json.dump({"displayNameNote":"App names, prices, access length and timer caps come from js/ladder/config.js (Salim's picks, Nov 22, 2026, 8:38 PM MT). The 10K level never carries the 5K house name.",
  "version":"v6","status":"Preview build. Nothing live until launch.","levels":[{"id":L["id"],"displayName":L["displayName"],"price":L["price"],"priceStatus":"decided"} for L in LEVELS],
  "daysPerWeekOptions":[2,3,4,5],"weeksByDays":WEEKS,"sessionsByDays":{2:36,3:36,4:40,5:45},
  "accessDaysByDays":ACCESS_DAYS,"accessNote":"Access = plan length + 2 weeks: 20/14/12/11 weeks for 2/3/4/5 days (decided). The exact end date is shown before purchase.",
  "accessStartsSelf":"purchase date","accessStartsGift":"redemption date","giftCodeRedeemableYears":5,
  "warningsDaysLeft":[28,14,5],"warningRule":"compute from the actual access end date; never mention $2.99",
  "cantFinishRule":"remaining sessions > sessions still possible before the end date, where possible = one per day and at most (daysPerWeek + 1) per 7 days",
  "openTimers":{"5k-open":{"capSeconds":{"walk-to-5k":3600,"5k-faster":2700},"status":"decided"},"10k-open":{"capSeconds":5400,"status":"decided"}},
  "placementStarts":{"walk-to-5k-from-week-6":{"level":"walk-to-5k","startCoreIndex":16,"when":"Q2 yes and Q3 no, or 12-minute check reaches 12:00"}},
  "restart":{"price":2.99,"offerDaysAfterExpiry":30,"newAccess":"same access length as the plan"},"repeat":{"price":2.99,"newAccess":"same access length as the plan"},
  "defaultDays":{k:[["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][x] for x in v] for k,v in DEFAULT_DAYS.items()},"spacingRule":"no key sessions on consecutive days; Walk to 5K: no 3 run days in a row (extra days are non-running); the engine re-orders within a week if the user picks other days","files":index},open(os.path.join(HERE,"index.json"),"w"),indent=2,ensure_ascii=False)

# weekly tables (anchor 3/wk)
md=[]
for L in LEVELS:
    md.append(f"\n#### Level {L['level']}: {L['displayName']}: 36 core sessions by anchor week (3 days/wk)\n")
    md.append("| Anchor wk | Session 1 | Session 2 | Session 3 |\n|---|---|---|---|")
    for w in range(1,13):
        c=L["core"](w)
        md.append(f"| {w} | "+" | ".join(f"{'**' if s['key'] else ''}{s['title']}{'**' if s['key'] else ''}: {s['summary']} _({s['reuse']})_" for s in c)+" |")
    ex=L["extra"](1); md.append(f"\nExtra day (4 and 5 days/wk): **{ex['title']}**: {ex['summary']}\n")
open(os.path.join(HERE,"weekly-tables.md"),"w").write("\n".join(md)+"\n")

# ---------------- validation ----------------
OLD=["walk-to-run","faster-5k","Walk-to-Run","Faster 5K"]
for e in index:
    d=json.load(open(os.path.join(HERE,e["file"]))); s=d["slots"]
    exp={2:36,3:36,4:40,5:45}[d["daysPerWeek"]]
    assert len(s)==exp==d["totalSessions"], e
    assert max(x["week"] for x in s)==d["weeks"]
    assert [x["slot"] for x in s]==list(range(1,exp+1))
    assert sorted(x["coreIndex"] for x in s if x["core"])==list(range(1,37))
    cores=[x["coreIndex"] for x in s if x["core"]]; 
    # core order may only be swapped inside a week
    assert all(x["durationSeconds"]>0 for x in s for x in x["steps"])
    assert s[0].get("checkin")=="day1" and s[-1].get("checkin")=="final" and s[-1]["week"]==d["weeks"]
    opens=[(x["slot"],st["type"]) for x in s for st in x["steps"] if st["type"].endswith("-open")]
    if d["id"]=="walk-to-5k": assert len(opens)==2 and all(t_=="5k-open" for _,t_ in opens)
    if d["id"]=="5k-faster": assert len(opens)==2 and opens[0][0]==1 and opens[-1][0]==exp and all(t_=="5k-open" for _,t_ in opens)
    if d["id"]=="10k": assert len(opens)==1 and opens[0]==(exp,"10k-open")
    for x in s:
        for st in x["steps"]:
            if st["type"]=="5k-open": assert st["durationSeconds"]==(3600 if d["id"]=="walk-to-5k" else 2700) and x.get("fiveK")
            if st["type"]=="10k-open": assert st["durationSeconds"]==5400 and x.get("tenK")
    # adjacency of key sessions within a week (worst case: consecutive days)
    for w in range(1,d["weeks"]+1):
        wk=[x for x in s if x["week"]==w]
        for a,b in consecutive_pairs(d["daysPerWeek"]):
            if a<len(wk) and b<len(wk) and wk[a]["key"] and wk[b]["key"]: problems.append(f"{e['file']} wk{w}: key sessions on consecutive default days: {wk[a]['title']} / {wk[b]['title']}")
    txt=json.dumps(d,ensure_ascii=False)
    for o in OLD: assert o not in txt, (e["file"],o)
    assert "™" not in txt and "®" not in txt
print("VALID:",[(e["file"],e["totalSessions"],e["weeks"]) for e in index])
print("key-adjacency notes:",len(problems)); [print(" ",p) for p in problems]
