#!/usr/bin/env python3
"""Fill the effective date on a policy page at publish time.

Each policy page carries its own token, one per language version:
  <p class="effective-date" lang="en" data-effective-date="" hidden>...<time datetime=""></time>...</p>
While data-effective-date is empty the line is hidden (hidden attribute plus CSS), so a page never shows a
literal placeholder. Use the day the page goes live:

  python3 tools/set-effective-date.py privacy/index.html 2026-10-20
  python3 tools/set-effective-date.py --check privacy/index.html privacy/consumer-health-data/index.html
"""
import datetime, re, sys

EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
TOKEN = re.compile(r'<p class="effective-date" lang="(en|es)" data-effective-date="([^"]*)"( hidden)?>(.*?)<time datetime="[^"]*">[^<]*</time>', re.S)

def human(d, lang):
    return f"{EN[d.month-1]} {d.day}, {d.year}" if lang == "en" else f"{d.day} de {ES[d.month-1]} de {d.year}"

def main(argv):
    if argv and argv[0] == "--check":
        bad = 0
        for f in argv[1:]:
            toks = TOKEN.findall(open(f, encoding="utf-8").read())
            empty = [t for t in toks if not t[1]]
            print(f"{f}: {len(toks)} token(s), {len(empty)} unfilled")
            bad += (not toks) or bool(empty)
        return 1 if bad else 0
    if len(argv) != 2:
        print(__doc__); return 2
    f, iso = argv
    d = datetime.date.fromisoformat(iso)
    s = open(f, encoding="utf-8").read()
    s2, n = TOKEN.subn(lambda m: f'<p class="effective-date" lang="{m.group(1)}" data-effective-date="{iso}">{m.group(4)}<time datetime="{iso}">{human(d, m.group(1))}</time>', s)
    if not n:
        print(f"{f}: no effective-date token found"); return 1
    open(f, "w", encoding="utf-8").write(s2)
    print(f"{f}: set {n} token(s) to {iso}")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
