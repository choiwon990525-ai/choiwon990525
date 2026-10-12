"""valorant-api.com 데이터를 data/api/ 에 받아 둔다 (요원·맵·버전 + 미니맵 이미지).

사용: python3 scripts/fetch_api.py
다시 돌리면 덮어쓴다 ("패치 갱신해" 때 사용).
"""
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = ROOT / "data" / "api"
MINIMAPS = API / "minimaps"

ENDPOINTS = {
    "version.json": "https://valorant-api.com/v1/version",
    "agents_ko.json": "https://valorant-api.com/v1/agents?language=ko-KR&isPlayableCharacter=true",
    "agents_en.json": "https://valorant-api.com/v1/agents?language=en-US&isPlayableCharacter=true",
    "maps_ko.json": "https://valorant-api.com/v1/maps?language=ko-KR",
    "maps_en.json": "https://valorant-api.com/v1/maps?language=en-US",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "valorant-manual/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    API.mkdir(parents=True, exist_ok=True)
    MINIMAPS.mkdir(parents=True, exist_ok=True)
    for name, url in ENDPOINTS.items():
        body = get(url)
        data = json.loads(body)
        if data.get("status") != 200:
            raise SystemExit(f"{url} -> status {data.get('status')}")
        (API / name).write_bytes(body)
        print("saved", name)
    maps = json.loads((API / "maps_en.json").read_bytes())["data"]
    for m in maps:
        if m.get("displayIcon") and m.get("callouts"):
            key = m["displayName"].lower()
            (MINIMAPS / f"{key}.png").write_bytes(get(m["displayIcon"]))
            print("minimap", key)
    v = json.loads((API / "version.json").read_bytes())["data"]
    print("branch", v["branch"], "build", v.get("buildDate"))


if __name__ == "__main__":
    main()
