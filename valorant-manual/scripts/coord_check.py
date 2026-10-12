"""좌표 확인: rib 킬·데스 점을 valorant-api 미니맵에 찍고, 변환식 후보를 숫자로 검증한다.

검증 1 (맵 안 비율): 변환한 점이 미니맵의 걸을 수 있는 칸(불투명 픽셀)에 떨어지는 비율.
검증 2 (구역 일치): 각 점을 '가장 가까운 valorant-api 콜아웃'으로 묶어
  진영 2 × 시간대 3 × 킬/데스 2 = 12칸 숫자를 만들고,
  프로승률 JSON(scopes.all)의 구역별 12칸 숫자와 똑같은 구역을 찾는다.
  코치 데이터도 '가장 가까운 콜아웃'으로 구역을 매겼으므로, 맞는 변환식이면
  모든 콜아웃이 구역 하나와 12칸 전부 일치한다. (이름 사전 없이 숫자로만 짝을 찾음)

사용: python3 scripts/coord_check.py [맵영문 ...]   (생략하면 확정 맵 7개)
출력: 표 + data/api/zone_map.json (맵별 변환식·콜아웃→코치 구역 이름)
그림: python3 scripts/coord_check.py --draw Haven 출력.png
"""
import json
import pathlib
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "rib_2026_1티어_원본합본.json"
WR = ROOT / "data" / "raw" / "프로승률_2026_1티어_전맵.json"
API = ROOT / "data" / "api"
ZONE_MAP = API / "zone_map.json"
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
POOL = ["Abyss", "Ascent", "Haven", "Lotus", "Split", "Summit", "Sunset"]

SIDES = {"Attack": "A", "Defense": "D"}
TIMES = {"0": "0-20", "20": "20-60", "60": "60+"}
CELLS = [(s, t, i) for s in ("A", "D") for t in ("0-20", "20-60", "60+") for i in (0, 1)]

# rib 0~100 좌표 (x, y) → 미니맵 UV (u, v) 후보
TRANSFORMS = {
    "그대로": lambda x, y: (x, y),
    "x·y 바꿈": lambda x, y: (y, x),
    "좌우 반전": lambda x, y: (1 - x, y),
    "상하 반전": lambda x, y: (x, 1 - y),
    "180도 회전": lambda x, y: (1 - x, 1 - y),
    "90도 회전": lambda x, y: (1 - y, x),
    "270도 회전": lambda x, y: (y, 1 - x),
    "x·y 바꿈+180도": lambda x, y: (1 - y, 1 - x),
}


def load_callouts(map_en):
    en = {m["displayName"]: m for m in json.loads((API / "maps_en.json").read_bytes())["data"]}[map_en]
    ko = {m["uuid"]: m for m in json.loads((API / "maps_ko.json").read_bytes())["data"]}[en["uuid"]]
    out = []
    for c_en, c_ko in zip(en["callouts"], ko["callouts"]):
        loc = c_en["location"]
        u = loc["y"] * en["xMultiplier"] + en["xScalarToAdd"]
        v = loc["x"] * en["yMultiplier"] + en["yScalarToAdd"]
        out.append({
            "en": f'{c_en["superRegionName"]} {c_en["regionName"]}',
            "ko_api": f'{c_ko["superRegionName"]} {c_ko["regionName"]}',
            "u": u, "v": v,
        })
    return en, ko, out


def map_points(raw, map_en):
    for key, pts in raw.items():
        m, side, kd, t = key.split("|")
        if m == map_en:
            for p in pts:
                yield SIDES[side], TIMES[t], 0 if kd == "kill" else 1, p


def nearest(callouts, u, v):
    return min(range(len(callouts)), key=lambda i: (callouts[i]["u"] - u) ** 2 + (callouts[i]["v"] - v) ** 2)


def check(raw, wr_all, callouts, minimap, map_en, tf):
    img = Image.open(minimap).convert("RGBA")
    w, h = img.size
    px = img.load()
    vec = [Counter() for _ in callouts]
    inside = n = 0
    for s, t, i, p in map_points(raw, map_en):
        u, v = tf(p[0] / 100, p[1] / 100)
        x, y = int(u * w), int(v * h)
        n += 1
        if 0 <= x < w and 0 <= y < h and px[x, y][3] > 0 and sum(px[x, y][:3]) > 30:
            inside += 1
        vec[nearest(callouts, u, v)][(s, t, i)] += 1
    zones = {}
    for s in ("A", "D"):
        for t in ("0-20", "20-60", "60+"):
            for z, kd in wr_all[s][t].items():
                zones.setdefault(z, Counter())
                zones[z][(s, t, 0)] = kd[0]
                zones[z][(s, t, 1)] = kd[1]
    names = {}
    for ci, cv in enumerate(vec):
        hits = [z for z, zv in zones.items() if all(cv[c] == zv[c] for c in CELLS)]
        if len(hits) == 1:
            names[ci] = hits[0]
    return inside / max(n, 1), names, len(zones), n


def run(maps):
    raw = json.loads(RAW.read_bytes())
    wr = json.loads(WR.read_bytes())["maps"]
    result = json.loads(ZONE_MAP.read_bytes()) if ZONE_MAP.exists() else {}
    for map_en in maps:
        en, ko, callouts = load_callouts(map_en)
        minimap = API / "minimaps" / f"{map_en.lower()}.png"
        print(f"\n{map_en} ({ko['displayName']}) 콜아웃 {len(callouts)}개")
        best = None
        for label, tf in TRANSFORMS.items():
            inside, names, nz, n = check(raw, wr[map_en]["scopes"]["all"], callouts, minimap, map_en, tf)
            print(f"  {label:<12} 맵 안 {inside:6.1%}   구역 12칸 완전 일치 {len(names):>2}/{len(callouts)} 콜아웃 (데이터 구역 {nz}개)")
            if best is None or (len(names), inside) > (len(best[2]), best[1]):
                best = (label, inside, names)
        label, inside, names = best
        print(f"  → 최적: {label}  (점 {n}개)")
        result[map_en] = {
            "transform": label,
            "inside": round(inside, 4),
            "matched": f"{len(names)}/{len(callouts)}",
            "callouts": [dict(c, zone=names.get(i)) for i, c in enumerate(callouts)],
        }
    ZONE_MAP.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nsaved", ZONE_MAP)


def draw_panel(raw, map_en, tf, callouts, label_key, title):
    img = Image.open(API / "minimaps" / f"{map_en.lower()}.png").convert("RGBA")
    w, h = img.size
    base = Image.new("RGBA", img.size, (18, 20, 26, 255))
    base = Image.alpha_composite(base, img)
    dots = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(dots)
    for s, t, i, p in map_points(raw, map_en):
        u, v = tf(p[0] / 100, p[1] / 100)
        x, y = u * w, v * h
        color = (70, 230, 110, 60) if i == 0 else (255, 70, 70, 60)
        d.ellipse((x - 2.5, y - 2.5, x + 2.5, y + 2.5), fill=color)
    base = Image.alpha_composite(base, dots)
    d = ImageDraw.Draw(base)
    font = ImageFont.truetype(FONT, 17)
    for c in callouts:
        x, y = c["u"] * w, c["v"] * h
        d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 215, 0, 255), outline=(0, 0, 0, 255), width=2)
        d.text((x + 8, y - 10), c.get(label_key) or c["ko_api"], font=font, fill=(255, 255, 255, 255),
               stroke_width=3, stroke_fill=(0, 0, 0, 255))
    big = ImageFont.truetype(FONT, 30)
    d.text((20, 16), title, font=big, fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0, 255))
    return base


def draw(map_en, out):
    raw = json.loads(RAW.read_bytes())
    zm = json.loads(ZONE_MAP.read_bytes())[map_en]
    callouts = zm["callouts"]
    left = draw_panel(raw, map_en, TRANSFORMS["그대로"], callouts, "zone", "변환 전 (rib 좌표 그대로)")
    right = draw_panel(raw, map_en, TRANSFORMS[zm["transform"]], callouts, "zone",
                       f"변환 후 ({zm['transform']}) · 맵 안 {zm['inside']:.1%} · 구역 일치 {zm['matched']}")
    w, h = left.size
    sheet = Image.new("RGB", (w * 2 + 20, h), (18, 20, 26))
    sheet.paste(left.convert("RGB"), (0, 0))
    sheet.paste(right.convert("RGB"), (w + 20, 0))
    sheet.save(out)
    print("saved", out)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--draw":
        draw(args[1], args[2])
    else:
        run(args or POOL)
