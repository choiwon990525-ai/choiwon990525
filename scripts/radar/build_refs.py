"""radar/references.json 만들기.

노션 레퍼런스 DB에서 내보낸 행(notion_refs_export.json)이 원본이고,
ref_candidates.json은 링크 점검(refcheck.json)을 통과한 것만 보탠다.
노션에 아직 없는 후보는 --new-out 파일로 따로 적어 노션에 추가할 수 있게 한다.
"""

import argparse
import datetime as dt
import json
import re


def norm(url):
    u = (url or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    return u.rstrip("/")


def alive(chk):
    st = (chk or {}).get("status") or 0
    return 200 <= st < 400 or st in (401, 403, 429)  # 403·429는 봇 차단일 뿐 사이트는 살아 있음


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--notion", required=True)
    ap.add_argument("--candidates", required=True)
    ap.add_argument("--refcheck", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--new-out", required=True)
    args = ap.parse_args()

    notion = json.load(open(args.notion, encoding="utf-8"))["items"]
    cands = json.load(open(args.candidates, encoding="utf-8"))["items"]
    checks = json.load(open(args.refcheck, encoding="utf-8"))["results"]

    out, seen = [], set()
    for r in notion:
        key = norm(r.get("url"))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({
            "name": r.get("name", ""), "url": r.get("url", ""), "cat": r.get("cat") or [], "format": r.get("format", ""),
            "maps": r.get("maps") or [], "agents": r.get("agents") or [], "lang": r.get("lang", ""),
            "use": r.get("use", ""), "use_level": r.get("use_level", ""), "classes": r.get("classes") or [],
            "price": r.get("price", ""), "freshness": r.get("freshness", ""), "memo": r.get("memo", ""), "source": "notion",
        })

    new_rows = []
    for c in cands:
        chk = checks.get("yt:" + c["youtube"]) if c.get("youtube") else checks.get("url:" + c.get("url", ""))
        if not alive(chk):
            continue
        url = chk.get("url") if c.get("youtube") else c["url"]
        key = norm(url)
        if c.get("youtube"):
            # 같은 채널이 노션에 /@핸들 주소로 들어가 있을 수 있음
            alt = norm("https://www.youtube.com/" + c["youtube"])
            if alt in seen:
                continue
            seen.add(alt)
        if key in seen:
            continue
        seen.add(key)
        freshness = "매 패치·실시간"
        memo = c.get("memo", "")
        if c.get("youtube") and chk.get("latest_upload"):
            days = (dt.date.today() - dt.date.fromisoformat(chk["latest_upload"])).days
            freshness = "매 패치·실시간" if days <= 30 else "가끔" if days <= 180 else "멈춤·오래됨"
            memo = (memo + " · " if memo else "") + "최근 업로드 " + chk["latest_upload"]
        if chk.get("status") in (401, 403, 429):
            memo = (memo + " · " if memo else "") + "자동 점검 차단(브라우저로는 열림)"
        row = {
            "name": c["name"], "url": url, "youtube": c.get("youtube", ""), "cat": c.get("cat") or [], "format": c.get("format", ""),
            "maps": c.get("maps") or ["전체"], "agents": c.get("agents") or ["전체"], "lang": c.get("lang", ""),
            "use": c.get("use", ""), "use_level": c.get("use_level", ""), "classes": c.get("classes") or [],
            "price": c.get("price", ""), "freshness": freshness, "memo": memo, "source": "candidate",
        }
        out.append(row)
        new_rows.append(row)

    json.dump({"updated": dt.date.today().isoformat(), "items": out}, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"items": new_rows}, open(args.new_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"references.json {len(out)}개 (노션 {len(out) - len(new_rows)} + 새 후보 {len(new_rows)})")


if __name__ == "__main__":
    main()
