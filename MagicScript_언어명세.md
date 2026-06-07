# MagicScript v0 언어명세

작성일: 2026-06-07

## 1. 목적

MagicScript는 『산식의 마법사』에서 플레이어가 마법을 직접 구현하기 위한 전용 줄 단위 스크립트 언어다. 브라우저에서 JavaScript를 직접 실행하지 않고, 허용된 명령만 파싱해 게임 시뮬레이터 명령으로 변환한다.

## 2. 기본 형태

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

## 3. 지원 명령

| 명령 | 예시 | 역할 |
|---|---|---|
| `spell` | `spell Iceball {` | 마법 이름을 선언한다. 저장 이름과 별도로 코드 내부 이름으로도 사용한다. |
| `range circle` | `range circle 22` | 조준점 주변 원형 범위를 지정한다. |
| `range rect` | `range rect 76 46` | 조준점 주변 사각 범위를 지정한다. |
| `range lane` | `range lane 14` | 시전자에서 조준점까지 이어지는 선형 범위를 지정한다. |
| `target` | `target type == H2O` | 범위 안의 대상 조건을 지정한다. 여러 줄이면 AND 조건이다. |
| `set` | `set temperature -= 68` | 대상 속성을 변경한다. |
| `push` | `push aim 8.5` | 대상을 시전자에서 조준점 방향으로 밀어낸다. |
| `swirl` | `swirl 5.2` | 대상을 조준점 주변으로 회전시킨다. |
| `output` | `output bloom` | 결과 출력 방식을 지정한다. |

## 4. 대상 조건

지원 필드:

```text
type, state, momentum, temperature, charge, cohesion, mass
```

지원 비교 연산자:

```text
==, !=, <, <=, >, >=
```

예시:

```tmf
target type == AIR
target charge >= 0.8
target state != plasma
```

## 5. 변경 가능한 속성

```text
momentum, temperature, charge, cohesion
```

지원 대입 연산자:

```text
=, -=, =
```

예시:

```tmf
set temperature += 150
set momentum -= 0.35
set charge = 1.2
```

## 6. 출력 모드

| 모드 | 효과 |
|---|---|
| `release` | 변환 결과를 즉시 반영한다. |
| `focus` | 마나를 아끼지만 시전 시간이 늘어난다. |
| `bloom` | 주변에도 약한 파동을 남긴다. |
| `anchor` | 변환 뒤 대상 속도를 낮춰 형태를 보존한다. |

## 7. 현재 제한

- 반복문과 사용자 정의 함수는 아직 없다.
- 한 마법의 효과 명령은 최대 16개까지 허용한다.
- `target` 조건은 최대 8개까지 허용한다.
- 수식 표현식은 아직 직접 지원하지 않고 숫자 상수만 받는다.
- 향후 v1에서 `let`, 거리 기반 값, 조건 분기, 안전한 산식 표현식을 추가할 수 있다.
