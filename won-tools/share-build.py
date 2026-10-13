"""장면 캡처 도구 공유판 만들기 — 다른 코치·학생에게 나눠 줄 zip

  python3 share-build.py [출력 폴더]      (기본: 이 파일 옆 dist/)

코치판(clip-extension)에서 개인용을 빼고 묶는다.
  - 빼는 것: gas/(시트 스크립트 사본), tablet/(태블릿 북마클릿), 설치방법.txt(새로 씀), *.bak
  - 끄는 것: 코치 시트로 보내기(텍틱·PPT·라운드 탭) — 받는 사람이 자기 시트(sheetId)를 연결해야 켜짐
             비공개 설정 시트 주소는 빈 글자, 스캔 기록 올리기는 기본 꺼짐
  - 남기는 것: VCT 조합 시트 읽기(보드의 '시트에서 요원 불러오기')
코드가 바뀌어 고칠 곳을 못 찾으면 멈춘다(assert) — 그때는 아래 patch 줄을 새 코드에 맞게 고친다.
"""
import json, os, re, shutil, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'clip-extension')
DIST = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, 'dist')
OUT = os.path.join(DIST, 'won-clip-share')
CFG_PRIVATE_ID = '1A7KxdTL9CXCsYEux79IFTygpNQ5eEBpHU90mAER84xQ'   # 코치 보내기 설정(웹 앱 주소·비밀번호) 시트
SHEET_DEFAULT_ID = '1qWUYBYoxLdzCXmmVG1rMeqKJ6y1gd0X9eUveR6ScBxU'  # VCT 2026 맵별 조합 시트 (읽기만)

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
for f in os.listdir(SRC):
    if f in ('gas', 'tablet', '설치방법.txt') or f.endswith('.bak'):
        continue
    p = os.path.join(SRC, f)
    (shutil.copytree if os.path.isdir(p) else shutil.copy)(p, os.path.join(OUT, f))


def patch(f, a, b, cnt=1):
    p = os.path.join(OUT, f)
    s = open(p, encoding='utf-8').read()
    assert s.count(a) == cnt, (f, s.count(a), a[:70])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b))


NOSHEET = "if (!prefs.sheetId) throw new Error('공유판: 시트로 보내기는 꺼져 있어요 (내 구글 시트를 연결해야 써요)');"

# net.js — 보드·분석 화면·텍틱 창이 같이 쓰는 보내기 설정
patch('net.js', "const CFG_PRIVATE = '%s';" % CFG_PRIVATE_ID, "const CFG_PRIVATE = '';")
patch('net.js', "    if (prefs.boardUrl && prefs.boardToken) return { url: prefs.boardUrl, token: prefs.boardToken };\n    let o =",
      "    if (prefs.boardUrl && prefs.boardToken) return { url: prefs.boardUrl, token: prefs.boardToken };\n    " + NOSHEET + "\n    let o =")
patch('net.js', "readCfgSheet(prefs.sheetId || SHEET_DEFAULT)", "readCfgSheet(prefs.sheetId)")

# background.js — 스캔 기록 보내기
patch('background.js', "const CFG_PRIVATE = '%s';" % CFG_PRIVATE_ID, "const CFG_PRIVATE = '';")
patch('background.js', "  if (prefs.boardUrl && prefs.boardToken) return { url: prefs.boardUrl, token: prefs.boardToken };\n  let o =",
      "  if (prefs.boardUrl && prefs.boardToken) return { url: prefs.boardUrl, token: prefs.boardToken };\n  " + NOSHEET + "\n  let o =")
patch('background.js', "readCfgSheet(prefs.sheetId || SHEET_DEFAULT)", "readCfgSheet(prefs.sheetId)")
patch('background.js', "if ((await getPrefs()).scanReport === false ||", "if ((await getPrefs()).scanReport !== true ||")

# manage.js — 관리 페이지의 '스캔 기록 올리기'
patch('manage.js', "const CFG_PRIVATE_M = '%s';" % CFG_PRIVATE_ID, "const CFG_PRIVATE_M = '';")
patch('manage.js', "if (!p0.boardUrl || !p0.boardToken) {", "if ((!p0.boardUrl || !p0.boardToken) && p0.sheetId) {")
patch('manage.js', "(p0.sheetId || '%s')" % SHEET_DEFAULT_ID, "p0.sheetId")

# 코치 비공개 설정 시트 주소가 남아 있으면 안 됨
for root, _, files in os.walk(OUT):
    for f in files:
        if f.endswith(('.js', '.html', '.json')):
            assert CFG_PRIVATE_ID not in open(os.path.join(root, f), encoding='utf-8').read(), f

mp = os.path.join(OUT, 'manifest.json')
m = json.load(open(mp, encoding='utf-8'))
m['name'] = '장면 캡처 도구 (공유판)'
m['short_name'] = '장면캡처'
json.dump(m, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

open(os.path.join(OUT, '설치방법.txt'), 'w', encoding='utf-8', newline='\r\n').write('''장면 캡처 도구 (공유판) v%s — 설치 방법
=========================================

[설치] 1분
1. 이 압축 파일을 원하는 곳에 풀기 (예: 문서 폴더) → won-clip-share 폴더가 생김. 설치 뒤에도 이 폴더를 지우거나 옮기면 안 됩니다.
2. 크롬 주소창에  chrome://extensions  입력
3. 오른쪽 위 '개발자 모드' 켜기
4. '압축해제된 확장 프로그램을 로드합니다' → 푼 폴더(manifest.json이 있는 폴더) 고르기
5. 퍼즐 아이콘(확장 프로그램) → 장면 캡처 도구 옆 핀을 눌러 고정
6. 유튜브 경기 영상을 열면 오른쪽 아래에 강아지가 있는 '장면 저장' 버튼이 뜹니다 (이미 열려 있던 탭은 새로고침)

[쓰는 법]
- S 키: 장면 저장 (분석 모드 = 멈추고 메모창, 시청 모드 = 안 멈추고 북마크)
- 영상 아래 '라운드 자동 찾기': 중계 점수판을 읽어 라운드마다 미니맵 3장(투명벽·1:25·1:00)을 찍음 (경기당 5~10분, 탭을 앞에 두기)
- 분석 열기(영상 아래 라운드 막대 · 도구 막대): 라운드마다 방송 미니맵·찍은 장면·붙인 스크린샷을 한 화면에서 보고, 그 위에 화살표·원·펜·글자로 그리기 · 라운드 메모
- 빈 맵 보드(분석 화면 위쪽): 미니맵을 보고 요원·스킬을 놓는 판 · 📄 자료 내보내기(보드 그림+메모를 한 파일로)
- 찍은 그림·파일은 '다운로드/관전캡처' 폴더에 저장됩니다

[알아둘 것]
- 모든 기록은 내 크롬 안에만 저장됩니다 (다른 사람과 자동으로 공유되지 않음). 관리 페이지(⚙)에서 백업·복원
- 공유판은 '시트로 보내기'(텍틱 시트·PPT)·스캔 기록 올리기가 꺼져 있습니다
- 새 버전을 받으면: 폴더 안 파일을 새것으로 바꾸고 chrome://extensions 에서 새로고침 → 열려 있던 유튜브 탭도 새로고침
- 확장 프로그램을 '삭제'하면 저장한 메모도 지워집니다. 업데이트는 새로고침으로만 하세요
- 메모는 글로 쓰는 게 기본입니다. 메모창의 🎤 버튼을 누르면 크롬 기본 음성 인식으로 받아써요 (마이크 허용 필요)
''' % m['version'])

zp = os.path.join(DIST, '장면캡처도구-공유판-v%s.zip' % m['version'])
if os.path.exists(zp):
    os.remove(zp)
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(OUT):
        for f in sorted(files):
            full = os.path.join(root, f)
            z.write(full, os.path.join('won-clip-share', os.path.relpath(full, OUT)))
print(zp, os.path.getsize(zp))
