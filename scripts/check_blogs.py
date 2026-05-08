import json, glob
files = sorted(glob.glob(r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\blogs\*.json"))
ok = 0
warn = 0
for f in files:
    d = json.load(open(f, encoding="utf-8"))
    words = len(d.get("content","").split())
    faqs = len(d.get("faqs", []))
    slug = d["slug"][:50]
    status = "OK" if words >= 1200 and faqs >= 5 else "WARN"
    if status == "WARN": warn += 1
    else: ok += 1
    print(f"{status}  {words:5d}w  {faqs}faq  {slug}")
print(f"\n{ok} OK, {warn} warnings")
