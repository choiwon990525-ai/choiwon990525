# WON 레이더

발로란트·AI 소식을 3시간마다 모으고, 전략·라인업·메타 레퍼런스를 함께 보여 주는 앱.

- 앱 주소: https://choiwon990525-ai.github.io/choiwon990525/
- 폰에 설치: 아이폰은 Safari 공유 → 홈 화면에 추가, 안드로이드는 Chrome 메뉴 → 앱 설치

## 어떻게 도나

1. `.github/workflows/radar.yml`이 3시간마다(KST 매 3시간 :17분) 실행됨
2. `collect.py`가 `sources.json`의 피드를 읽어 `data.json`을 만듦 (14일치 보관, 처음 본 시각 기록)
3. `radar/` 화면 파일과 `data.json`을 `gh-pages` 브랜치로 배포 → GitHub Pages가 앱 주소로 보여 줌

## 자주 하는 일

| 하고 싶은 것 | 방법 |
|---|---|
| 소스 추가·삭제 | `sources.json`에 한 줄 추가. `cat`은 `valorant`/`ai`, `group`은 앱의 분류 칩 이름 |
| 지금 바로 수집 | GitHub → Actions → "WON 레이더 수집" → Run workflow |
| 레퍼런스 갱신 | 노션 「📚 전략·라인업·메타 레퍼런스」에 행 추가 후 Claude에게 "레이더 레퍼런스 갱신해줘" → 노션 행을 `notion_refs_export.json`으로 내보내고 `build_refs.py`로 `radar/references.json`을 다시 만듦 |
| 레퍼런스 후보 추가 | `ref_candidates.json`에 한 줄(유튜브는 `"youtube": "@핸들"`). 다음 수집 때 링크·최근 업로드를 확인하고, 통과한 것만 앱에 나옴 |
| 매일 Claude 브리핑 켜기 (선택, API 요금 발생) | 저장소 Settings → Secrets → Actions에 `ANTHROPIC_API_KEY` 추가. 하루 한 번 Claude Opus 5.5가 제목만 보고 3줄씩 요약 |

소스가 실패하면 앱 맨 아래 "수집 소스"에 빨간 점으로 표시되고, 나머지 소스는 그대로 돕니다.
레퍼런스 링크는 `check_refs.py`가 7일에 한 번 다시 열어 봅니다. 앱에서 '링크 확인 안 됨'은 실제로 안 열린 것, '자동 확인 불가'는 사이트가 자동 점검을 막은 것(브라우저로는 열림), '업로드 멈춤'은 반년 넘게 새 영상이 없는 채널입니다.
