# REVIEW — 코치 확인 목록

## 확인 필요
- [x] 맵 확정 (2026-10-12): 현재 경쟁전 풀 7개 — 어비스, 어센트, 헤이븐, 로터스, 스플릿, 서밋(써밋), 선셋
- [x] 써밋/서밋 표기: valorant-api ko-KR 공식명은 "서밋" → 화면 표기는 "서밋" (코치 엑셀 맵 목록만 "써밋")
- [ ] 좌표 변환식 코치 OK 대기 (2026-10-12 검증, scripts/coord_check.py · data/api/zone_map.json)
  - 270도 회전 (u = y/100, v = 1 − x/100): 어비스 98.6% · 어센트 99.9% · 헤이븐 98.4% · 스플릿 99.4% 맵 안
  - 그대로 (u = x/100, v = y/100): 로터스 100% · 선셋 100% · 서밋 99.1% 맵 안
  - 7맵 모두, 점을 가장 가까운 콜아웃으로 묶으면 코치 엑셀 구역별 [킬, 데스]와 진영·시간대 12칸이 전부 일치
  - 서밋: API의 "공격팀 진영 시작 지점" 콜아웃이 맵 밖(왼쪽 아래)에 찍혀 있어 교전 0건 → 데이터에도 "공격 스폰" 구역 없음. 실제 공격 스폰 근처 교전은 옆 구역으로 묶임 (API 데이터 문제, 코치 엑셀도 같은 방식)
- [x] 기준 패치: valorant-api version branch release-13.06 → 13.06 (빌드 2026-09-25)
- [ ] Act 6 맵 로테이션: 10/14(또는 챔피언스 종료 후 10/17 전후) 예정. 유출설 = 어센트·스플릿 OUT, 바인드·코로드 IN (라이엇 미확인). 패치노트 나오면 다시 확인.

## 맵 풀 (2026-10-12 웹 조사)
- 현재 경쟁전 7개 (13.04, 2026-08-18부터 · 13.05·13.06 변동 없음): 어비스, 어센트, 헤이븐, 로터스, 스플릿, 서밋(써밋), 선셋
- 챔피언스 2026(상하이, 9/24~10/18) 맵 풀도 같은 7개, 패치는 13.05
- 2026 로테이션 이력: 12.05(+로터스 +프랙처 / −어비스 −코로드) → 12.08(+어센트 / −바인드) → 13.00(+서밋 +선셋 / −프랙처 −펄) → 13.04(+어비스 / −브리즈)
- 주의: 이 환경에서 웹페이지 본문 열람이 막혀 있어, 검색 결과 요약으로만 교차 확인함 (검색 3갈래 + 검증 1회, 결과 일치)

## 참고한 웹 출처
### 맵 풀
- 공식 13.04 패치노트 (2026-08-18): https://playvalorant.com/ko-kr/news/game-updates/valorant-patch-notes-13-04/
- 공식 13.00 패치노트 (2026-06-23): https://playvalorant.com/ko-kr/news/game-updates/valorant-patch-notes-13-00/
- 공식 13.05 패치노트 (2026-09-01, 맵 변동 없음): https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-05/
- 13.06 패치 정리 (2026-09-22, 맵 변동 없음): https://patched.gg/games/valorant/valorant-patch-notes-1306
- 12.08 패치 (어센트 IN, 바인드 OUT): https://www.gfinityesports.com/article/valorant-12-08-patch
- 12.05 패치 (로터스·프랙처 IN): https://www.strafe.com/news/read/fracture-and-lotus-rejoin-valorant-map-pool-for-v26-act-2/
- Liquipedia 패치 목록 (최신 13.06): https://liquipedia.net/valorant/Portal:Patches
- 현재 맵 풀 정리 (2026-10-10 갱신): https://www.valorant-spind.de/en/valorant-maps.html
- 챔피언스 2026 맵 풀: https://bo3.gg/valorant/news/abyss-returns-to-valorant-map-pool-ahead-of-champions-2026-as-breeze-leaves-rotation
- 챔피언스 일정·패치 13.05: https://www.talkesport.com/news/valorant-shanghai-schedule/
- Act 6 유출 (미확인): https://bo3.gg/valorant/news/valorant-map-pool-leak-corrode-bind-replace-ascent-split
- Act 6 유출 (미확인): https://www.talkesport.com/news/valorant/valorant-v26a6-map-pool-leak-bind-corrode/
- Act 6 유출 (미확인): https://egw.news/valorant/news/37725/corrode-and-bind-to-return-to-valorants-competitiv-wWQCyzBFD
- 한글 맵 이름 (커뮤니티): https://arca.live/b/valorant/180267724
