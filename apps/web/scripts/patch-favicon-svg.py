from pathlib import Path
p = Path("public/favicon.svg")
t = p.read_text(encoding="utf-8")
needle = '  <path fill="#fff"'
insert = '  <g transform="translate(512 512) scale(0.78) translate(-475 -512)">\n  <path fill="#fff"'
if "scale(0.78)" not in t:
    if needle not in t:
        raise SystemExit("needle missing")
    t = t.replace(needle, insert, 1)
    if "</g>" not in t:
        t = t.replace("</svg>", "  </g>\n</svg>", 1)
    p.write_text(t, encoding="utf-8")
print("ok", "scale(0.78)" in p.read_text(encoding="utf-8"))
