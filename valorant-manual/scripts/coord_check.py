"""좌표 확인: rib 킬·데스 점을 valorant-api 미니맵에 찍고, 변환식 후보를 숫자로 검증한다.

검증 방법: 각 점을 '가장 가까운 valorant-api 콜아웃'으로 분류해서
프로승률 JSON(scopes.all)의 구역별 [킬, 데스]와 칸 단위로 비교한다.
코치 데이터가 같은 방식(가장 가까운 콜아웃)으로 구역을 매겼으므로,
맞는 변환식이면 거의 모든 칸이 일치해야 한다.

사용: python3 scripts/coord_check.py [맵영문=Haven] [출력 png 경로]
"""
import json
import math
import pathlib
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "rib_2026_1티어_원본합본.json"
WR = ROOT / "data" / "raw" / "프로승률_2026_1티어_전맵.json"
API = ROOT / "data" / "api"
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

SIDES = {"Attack": "A", "Defense": "D"}
TIMES = {"0": "0-20", "20": "20-60", "60": "60+"}

# rib 0~100 좌표 (x, y) → 미니맵 UV (u, v) 후보
TRANSFORMS = {
    "그대로 (u=x, v=y)": lambda x, y: (x, y),
    "x·y 바꿈": lambda x, y: (y, x),
    "좌우 반전": lambda x, y: (1 - x, y),
    "상하 반전": lambda x, y: (x, 1 - y),
    "180도 회전": lambda x, y: (1 - x, 1 - y),
    "90도 회전": lambda x, y: (1 - y, x),
    "270도 회전": lambda x, y: (y, 1 - x),
    "x·y 바꿈 + 180도": lambda x, y: (1 - y, 1 - x),
}


def load_map(name_en):
    en = {m["displayName"]: m for m in json.loads((API / "maps_en.json").read_bytes())["data"]}
    ko = {m["uuid"]: m for m in json.loads((API / "maps_ko.json").read_bytes())["data"]}
    m_en = en[name_en]
    m_ko = ko[m_en["uuid"]]
    callouts = []
    for c in m_ko["callouts"]:
        loc = c["location"]
        u = loc["y"] * m_ko["xMultiplier"] + m_ko["xScalarToAdd"]
        v = loc["x"] * m_ko["yMultiplier"] + m_ko["yScalarToAdd"]
        callouts.append((f'{c["superRegionName"]} {c["regionName"]}', u, v))
    return m_ko, callouts


def nearest(callouts, u, v):
    return min(callouts, key=lambda c: (c[1] - u) ** 2 + (c[2] - v) ** 2)[0]


def score(raw, wr_all, callouts, map_en, tf):
    mine = Counter()
    for key, pts in raw.items():
        m, side, kd, t = key.split("|")
        if m != map_en:
            continue
        for p in pts:
            u, v = tf(p[0] / 100, p[1] / 100)
            mine[(SIDES[side], TIMES[t], nearest(callouts, u, v), 0 if kd == "kill" else 1)] += 1
    total = same = 0
    for s in ("A", "D"):
        for t in ("0-20", "20-60", "60+"):
            for zone, kd in wr_all[s][t].items():
                for i in (0, 1):
                    total += 1
                    same += mine[(s, t, zone, i)] == kd[i]
    return same, total


def draw(raw, map_en, minimap, callouts, tf, out):
    img = Image.open(minimap).convert("RGBA")
    w, h = img.size
    dots = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(dots)
    for key, pts in raw.items():
        m, side, kd, t = key.split("|")
        if m != map_en:
            continue
        color = (60, 220, 90, 70) if kd == "kill" else (240, 60, 60, 70)
        for p in pts:
            u, v = tf(p[0] / 100, p[1] / 100)
            x, y = u * w, v * h
            d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=color)
    img = Image.alpha_composite(img, dots)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, max(12, w // 70))
    for name, u, v in callouts:
        x, y = u * w, v * h
        d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(255, 220, 0, 255), outline=(0, 0, 0, 255))
        d.text((x + 6, y - 8), name, font=font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    img.convert("RGB").save(out)


def main():
    map_en = sys.argv[1] if len(sys.argv) > 1 else "Haven"
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / f"coord_check_{map_en.lower()}.png"
    raw = json.loads(RAW.read_bytes())
    wr_all = json.loads(WR.read_bytes())["maps"][map_en]["scopes"]["all"]
    m_ko, callouts = load_map(map_en)
    print(f"{map_en} ({m_ko['displayName']}) 콜아웃 {len(callouts)}개")
    results = []
    for label, tf in TRANSFORMS.items():
        same, total = score(raw, wr_all, callouts, map_en, tf)
        results.append((same / total, label))
        print(f"  {label:<16} 구역 칸 일치 {same}/{total} ({same / total:.1%})")
    best_rate, best = max(results)
    print(f"최적: {best} ({best_rate:.1%})")
    draw(raw, map_en, API / "minimaps" / f"{map_en.lower()}.png", callouts, TRANSFORMS[best], out)
    print("saved", out)


if __name__ == "__main__":
    main()
