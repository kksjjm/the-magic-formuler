# 산식의 마법사 (The Equation Mage)

MagicScript로 마법 코드를 작성하면 바로 옆 실험장에서 실행 결과를 시각적으로 확인할 수 있는 웹 기반 마법 제작 샌드박스입니다.

## 배포 링크

- GitHub 저장소: https://github.com/kksjjm/the-magic-formuler
- GitHub Pages: https://kksjjm.github.io/the-magic-formuler/

## 게임 설명

『산식의 마법사』는 "마법은 곧 수식이다"라는 콘셉트의 실험형 게임입니다. 플레이어는 전용 언어인 MagicScript로 범위, 대상 조건, 속성 변화, 출력 방식을 작성하고, 코드가 물질 세계에 어떤 현상을 만드는지 즉시 확인합니다.

현재 버전은 Tier 1 추상 규칙 기반 MVP입니다. 물, 공기, 흙 객체가 실험장에 배치되고, 플레이어가 작성한 코드가 운동량, 온도, 전하, 응집도 등을 바꾸면 상태 전이 규칙에 따라 얼음, 증기, 플라즈마, 유리 같은 결과가 나타납니다.

## 주요 기능

- MagicScript 코드 편집기
- 코드 변경 시 컴파일 결과와 실행 분석 즉시 갱신
- 자동 실행 프리뷰
- 캔버스 기반 실험장
- 마나, 시전 시간, 등급 계산
- 예시 마법 코드: 아이스볼, 증기분수, 정전기 고리, 유리 씨앗
- 마법 이름 저장, 열기, 삭제
- 공유 코드 내보내기와 불러오기
- 선택 도전 과제

## MagicScript 예시

```tmf
spell Iceball {
  range circle 22
  target type == H2O
  set momentum -= 0.60
  set temperature -= 68
  set cohesion += 0.28
  push aim 8.5
  output release
}
```

## 폴더 구조

```text
The Magic Formuler/
├─ index.html
├─ README.md
├─ 개발_정리.md
├─ MagicScript_언어명세.md
├─ 산식의_마법사_게임기획서.md
└─ src/
   ├─ main.js
   ├─ magic-script.js
   ├─ styles.css
   └─ data/
      ├─ blocks.json
      ├─ challenges.json
      ├─ presets.json
      └─ substances.json
```

## 각 파일의 역할

| 파일 | 역할 |
|---|---|
| `index.html` | 게임의 단일 진입점입니다. 코드 편집기, 실험장, 분석 패널, 저장/공유 UI를 배치합니다. |
| `src/main.js` | 월드 생성, 시뮬레이션, MagicScript 실행, 비용 계산, 저장/공유 기능을 담당합니다. |
| `src/magic-script.js` | MagicScript v0 파서, 예시 마법 코드, 컴파일 요약 생성을 담당합니다. |
| `src/styles.css` | 코드 편집기 중심 UI와 반응형 레이아웃을 담당합니다. |
| `src/data/substances.json` | 물질 속성, 상태 전이, 마나 가중치, 응집 규칙을 정의합니다. |
| `src/data/challenges.json` | 선택 도전 과제와 목표를 정의합니다. |
| `src/data/blocks.json` | 이전 블록형 MVP 데이터입니다. 향후 블록-코드 변환에 활용할 수 있습니다. |
| `src/data/presets.json` | 이전 블록형 MVP 예시 레시피입니다. 현재 예시는 `magic-script.js`에 있습니다. |
| `MagicScript_언어명세.md` | MagicScript v0 문법과 제한 사항을 정리한 문서입니다. |
| `개발_정리.md` | 개발 진행 내용과 다음 작업을 정리한 문서입니다. |

## 실행 방법

```powershell
cd "C:\Users\KING-K-S\Desktop\projects\Games\The Magic Formuler"
C:\Python390\python.exe -m http.server 5174 --bind 127.0.0.1
```

브라우저에서 열기:

```text
http://127.0.0.1:5174/index.html
```

## 현재 개발 내용

- 블록 선택형 마법 편집기를 코드 작성형 MagicScript 실험실로 전환했습니다.
- MagicScript v0 파서와 안전한 명령 실행 흐름을 추가했습니다.
- 코드 저장, 이름 붙이기, 공유 코드 내보내기/불러오기를 구현했습니다.
- 실험장, 비용 분석, 챌린지 판정을 MagicScript 실행 흐름과 연결했습니다.
- 인앱 브라우저에서 UI 로드, 예시 코드 전환, 자동 프리뷰, 저장, 공유 코드 생성을 검증했습니다.

## 앞으로 개발할 내용

- MagicScript v1: 변수, 거리 기반 값, 조건 분기, 안전한 수식 표현식
- 코드 에디터: 줄 번호, 구문 강조, 오류 라인 표시, 자동 완성
- 저장된 마법의 설명, 태그, 썸네일, 실행 결과 스냅샷
- 리플레이와 단계별 디버거
- 블록 UI와 MagicScript 사이의 양방향 변환
- Tier 2 준-물리 입자 시뮬레이션

## GitHub Pages 배포

정적 웹앱이므로 GitHub Pages에서 루트 디렉터리를 그대로 배포할 수 있습니다.

권장 설정:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

배포 후 `index.html`이 첫 화면으로 실행됩니다.
