# Metal Blade — UI 재설계 계획서

> 작성일: 2026-05-03  
> 대상 브랜치: main  
> 설계 기준: DESIGN-bugatti.md (Bugatti 럭셔리 미니멀 시스템)

---

## 1. 현재 상태 진단

### 1.1 구조 요약

```
index.html
├── #top-nav        — 로고 / 태그라인 / 이벤트 제목 / Battle Start 버튼
├── #game-area      — Three.js 캔버스 (fullscreen)
├── #bottom-info    — 참가자 인풋 + 리스트 (우하단 고정)
├── #result-overlay — 결과 오버레이
└── #sound-toggle   — 좌하단 고정
```

게임 상태 머신: `idle → intro → countdown → battle → result`

### 1.2 문제점 목록

| # | 분류 | 문제 |
|---|------|------|
| P1 | UX 플로우 | 인풋과 게임이 같은 화면에 공존 → 게임 중 UI 노이즈, 집중 방해 |
| P2 | 비주얼 | 배경 `#0a0a12` 단색 → 툴처럼 보임, 게임 몰입감 없음 |
| P3 | 성능 | 팽이 1개당 9개 Mesh + 1개 PointLight → 30명 시 270 Mesh + 30 Light (GPU 과부하) |
| P4 | 모바일 | 상단 nav가 4행으로 붕괴, 참가자 패널이 게임 화면을 가림 |
| P5 | 디자인 톤 | 버튼·입력 스타일이 일반 웹앱 수준 → 브랜드 차별성 없음 |

---

## 2. UX 플로우 재설계

### 2.1 새 플로우 구조

```
[SETUP SCREEN]
    ↓  Battle Start 클릭
[BATTLE SCREEN]  ←→  [팝업: 참가자 편집]
    ↓  게임 종료
[RESULT OVERLAY]
    ↓  Play Again / Edit Players
[SETUP SCREEN 또는 BATTLE SCREEN]
```

### 2.2 Phase 1: Setup Screen (신규)

게임 시작 전 **전용 셋업 화면**을 분리한다.  
배경은 Three.js 스타디움을 그대로 보여주되 카메라를 위에서 내려다보는 탑뷰 idle 앵글로 고정.  
팽이들은 제자리에서 느리게 공회전하며 미리보기 역할을 한다.

```
┌────────────────────────────────────────────┐
│  [LOGO]                                    │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │  TITLE (이벤트명 입력)              │   │
│  └─────────────────────────────────────┘   │
│                                            │
│  ┌──────────────────┐  ┌───────────────┐   │
│  │ Name 입력        │  │ 참가자 목록   │   │
│  │ [+Add]  [CSV]    │  │ • 이름 1      │   │
│  │ [Shuffle]        │  │ • 이름 2      │   │
│  └──────────────────┘  └───────────────┘   │
│                                            │
│         ┌─────────────────────┐            │
│         │   BATTLE  START     │  ← primary │
│         └─────────────────────┘            │
└────────────────────────────────────────────┘
```

**레이아웃 구현:**
- 셋업 카드(`#setup-panel`)를 화면 중앙에 absolute 배치
- Three.js 캔버스는 배경으로 항상 렌더링 (팽이 idle 회전)
- 배틀 시작 → `#setup-panel` 슬라이드-다운 퇴장 애니메이션 (300ms) 후 숨김

### 2.3 Phase 2: Game Screen

배틀 중에는 **UI를 최소화**해 게임에만 집중.

```
┌────────────────────────────────────────────┐
│  [⚙]                     00:28   [🔊]      │
│  (설정)           (타이머)       (사운드)  │
│                                            │
│                                            │
│          ← Three.js 캔버스 fullscreen →   │
│                                            │
│                                            │
│              N REMAINING                  │
│                                            │
│  [참가자 목록 — 접힌 사이드 스트립]        │
└────────────────────────────────────────────┘
```

- 참가자 목록: 우측에 좁은 세로 스트립 (width: 160px) — 호버 시 펼쳐짐
- 타이머 / REMAINING 텍스트 외 모든 입력 UI 숨김
- 좌상단 ⚙ 버튼 → 팝업 인풋 모드 진입 (2.4 참고)

### 2.4 팝업 인풋 모드 (옵션 변형)

게임 시작 없이 빠르게 참가자를 수정해야 할 때 사용.  
배틀 화면 또는 결과 화면에서도 접근 가능.

```
┌─────────────────────────────┐
│  PARTICIPANTS               │ ← 팝업 제목
│  ─────────────────────────  │
│  Name _____________ [+]     │
│  [CSV Upload]  [Shuffle]    │
│                             │
│  • 이름1   [×]              │
│  • 이름2   [×]              │
│  ...                        │
│                             │
│  [CANCEL]    [START BATTLE] │
└─────────────────────────────┘
```

- `backdrop-filter: blur(20px)` 반투명 배경
- Enter 키로 빠르게 추가
- 팝업 외부 클릭 시 닫힘 (입력 내용 보존)

---

## 3. 비주얼 디자인 레벨업

### 3.1 배경 — Three.js 씬 강화

현재: 단순 `background: #0a0a12`

**개선안 A — 스타디움 아레나 바닥 (권장)**

`stadium.js`에 아레나 그라운드 플레인 추가:
- 동심원 그리드: `THREE.RingGeometry`로 5~6개 동심원 (머티리얼: `MeshBasicMaterial`, wireframe-like, opacity 0.08)
- 방사형 선: 12방향 라인 (opacity 0.05)
- 바닥 그라운드 플레인: `PlaneGeometry` + 반사 머티리얼 (`MeshStandardMaterial`, roughness: 0.1, metalness: 0.8)
- 팽이가 많아질수록 네온 컬러의 `PointLight`들이 바닥에 반사되어 자동으로 배경이 역동적으로 변함

**개선안 B — CSS 비네트 + 방사형 글로우**

```css
#game-area::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 60% 55% at 50% 50%,
    transparent 0%,
    rgba(0,0,0,0.5) 70%,
    rgba(0,0,0,0.85) 100%
  );
  pointer-events: none;
  z-index: 2;
}
```

**두 안 모두 적용** → A로 깊이감, B로 아레나 포커싱 효과


### 3.2 타이포그래피 & 컬러 시스템 정비

**현재 폰트:** Inter (Google Fonts)  
**개선:** 게임 캐릭터에 맞는 폰트 추가

```html
<!-- index.html head에 추가 -->
<link href="https://fonts.googleapis.com/css2?
  family=Rajdhani:wght@300;400;500;600&
  family=Space+Mono:wght@400;700&
  family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
```

| 용도 | 현재 | 개선안 |
|------|------|--------|
| 로고/타이틀 헤드라인 | Inter 400 | Rajdhani 400 (wide tracking) |
| 버튼 레이블 | Inter 300 uppercase | Space Mono 400 uppercase |
| 카운트다운 숫자 | Inter 600 | Rajdhani 600 |
| 참가자 이름 | Inter 300 | Inter 300 (유지) |
| REMAINING / HUD | Inter 300 | Space Mono 400 |

**컬러 토큰 정의 (style.css 상단):**

```css
:root {
  --c-canvas:      #000000;
  --c-surface:     #0d0d0d;
  --c-surface-md:  #141414;
  --c-surface-hi:  #1e1e1e;
  --c-hairline:    #262626;
  --c-hairline-hi: #383838;
  --c-ink:         #ffffff;
  --c-body:        #cccccc;
  --c-muted:       #888888;
  --c-muted-soft:  #555555;
  --c-accent:      #00BFFF;   /* 카운트다운, 포커스 */
}
```

### 3.3 컴포넌트 레벨업

**버튼 (Bugatti-inspired pill):**

```css
.btn-primary {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.5);
  border-radius: 9999px;       /* pill */
  padding: 13px 36px;
  font-family: 'Space Mono', monospace;
  font-size: 13px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.btn-primary:hover {
  border-color: #ffffff;
  box-shadow: 0 0 24px rgba(255,255,255,0.12);
}
```

**텍스트 인풋 (bottom-border only):**

```css
.input-field {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--c-hairline-hi);
  color: var(--c-ink);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  padding: 10px 0;
  outline: none;
  transition: border-color 0.2s;
}
.input-field:focus {
  border-bottom-color: var(--c-ink);
}
```

**Setup Panel:**

```css
#setup-panel {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  /* 배경 없음 — Three.js 씬이 투시됨 */
  transition: opacity 0.3s ease, transform 0.3s ease;
}
#setup-panel.hide {
  opacity: 0;
  transform: translateY(20px);
  pointer-events: none;
}
```

**참가자 사이드 스트립 (게임 중):**

```css
#side-strip {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;            /* 기본: 접힌 상태 */
  background: rgba(255,255,255,0.04);
  border-left: 1px solid var(--c-hairline);
  transition: width 0.25s ease;
  overflow: hidden;
  z-index: 6;
}
#side-strip:hover {
  width: 200px;
}
```

---

## 4. 렌더링 성능 최적화

팽이 30개 기준 현재 렌더링 부담:

| 요소 | 현재 개수 | 예상 GPU 부하 |
|------|-----------|---------------|
| **`MeshPhysicalMaterial` + `transmission: 0.15` (disc)** | **30** | **최상 — 매 프레임 씬 이중 렌더링** |
| `MeshPhysicalMaterial` (claws, core, handle, tip) | 7개/top × 30 = **210** | 높음 (PBR 셰이더) |
| Mesh (disc, decal, claw×4, core, handle, tip) | 9개/top × 30 = **270** | 높음 (draw call) |
| PointLight | 1개/top × 30 = **30** | 매우 높음 |
| CanvasTexture (decal + label) | 2개/top × 30 = **60** | 높음 (메모리) |

> **재진단 결과:** 가장 큰 병목은 **PointLight가 아니라 `transmission` 속성**임.  
> Three.js의 `MeshPhysicalMaterial`에서 `transmission > 0`이면 **매 프레임마다 씬 전체를 두 번째 framebuffer에 렌더링**한 후 굴절을 계산함. 팽이 1개만 있어도 비싸고, 30개 disc가 모두 transmission을 가지면 GPU에 치명적.

### 4.1 ⭐ disc 머티리얼에서 `transmission` 제거 (1순위)

**tops.js — disc 머티리얼 교체:**

```js
// 변경 전 (tops.js:80~88)
new THREE.MeshPhysicalMaterial({
  color: c, transparent: true, opacity: 0.72,
  roughness: 0.1, metalness: 0.1,
  emissive: c, emissiveIntensity: 0.2,
  transmission: 0.15,                  // ← 이중 렌더 패스 트리거
  side: THREE.DoubleSide,
})

// 변경 후 — MeshStandardMaterial로 다운그레이드
new THREE.MeshStandardMaterial({
  color: c, transparent: true, opacity: 0.82,
  roughness: 0.15, metalness: 0.2,
  emissive: c, emissiveIntensity: 0.25,  // 약간 올려 transmission 손실 보완
  side: THREE.DoubleSide,
})
```

**효과:** 매 프레임 두 번째 씬 렌더링 패스 제거 → 단일 변경으로 가장 큰 FPS 회복.  
**시각 손실:** disc의 미묘한 굴절감만 사라지며, 전반적인 룩은 유지됨.

### 4.2 ⭐ `MeshPhysicalMaterial` → `MeshStandardMaterial` 일괄 전환 (2순위)

claws, core, handle, tip 모두 `MeshPhysicalMaterial`을 쓰고 있지만, transmission/clearcoat/sheen 같은 PBR 고급 속성을 실제로 사용하지 않음. 즉 **셰이더 비용만 비싸고 시각 효과는 동일**.

```js
// claws (tops.js:130~135)
new THREE.MeshStandardMaterial({
  color: c, transparent: true, opacity: 0.88,
  roughness: 0.08, metalness: 0.7,
  emissive: c, emissiveIntensity: 0.32,
  side: THREE.DoubleSide,
})

// core (tops.js:151)
new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: c, emissiveIntensity: 0.7,
  transparent: true, opacity: 0.9,
})

// handle (tops.js:160)
new THREE.MeshStandardMaterial({
  color: c, transparent: true, opacity: 0.9, roughness: 0.1,
})

// tip (tops.js:169~173)
new THREE.MeshStandardMaterial({
  color: c, transparent: true, opacity: 0.8,
  metalness: 0.85, roughness: 0.15,
  emissive: c, emissiveIntensity: 0.15,
})
```

**효과:** PBR 셰이더 컴파일·실행 비용이 30~40% 감소. 시각적으로는 거의 동일.

### 4.3 PointLight 제거 → 공유 조명으로 교체 (3순위)

**tops.js 수정:**

```js
// 제거 (tops.js:179~181):
const light = new THREE.PointLight(color, 0.6, 2.5 * S);
light.position.y = 0.1 * S;
group.add(light);

// scene.js에 HemisphereLight 추가 (전체 분위기 보강):
const hemi = new THREE.HemisphereLight(0x1a1a3a, 0x050510, 0.55);
scene.add(hemi);

// 기존 spotLight를 더 적극적으로 활용 — 충돌 시 짧게 점멸
// (camera.js의 onImpact에서 이미 flashLight 사용 중)
```

**효과:** WebGL은 라이트 수가 늘수록 셰이더 분기 비용이 증가. 30개 PointLight → 0개로 감소.  
**시각 손실:** 팽이 주변 자체광 사라짐. 단, emissive 강화(4.1, 4.2)로 보완 가능.

### 4.4 InstancedMesh 도입 (disc + tip + claws 모두)

기존 계획서가 disc + tip만 언급했지만, **claws (4개/top × 30 = 120개)가 가장 무거운 ExtrudeGeometry**. claws도 instancing 대상에 포함.

```js
// tops.js — 공유 geometry + InstancedMesh
const MAX_TOPS = 30;
const discGeo = new THREE.CylinderGeometry(DISC_R_BASE, DISC_BOT_R_BASE, DISC_H_BASE, 24);
const tipGeo  = new THREE.ConeGeometry(0.05, 0.32, 12);
const clawGeo = buildClawGeometry(1.0);  // 단위 스케일, instanceMatrix로 스케일 처리

export const discInstances = new THREE.InstancedMesh(discGeo, discMat, MAX_TOPS);
export const tipInstances  = new THREE.InstancedMesh(tipGeo,  tipMat,  MAX_TOPS);
export const clawInstances = new THREE.InstancedMesh(clawGeo, clawMat, MAX_TOPS * 4);  // 4 claws/top

// 색상은 InstancedBufferAttribute로 per-instance 전달
const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TOPS * 3), 3);
discInstances.geometry.setAttribute('instanceColor', colorAttr);
// ↑ 머티리얼의 onBeforeCompile에서 instanceColor를 사용하도록 셰이더 패치
```

**draw call:**
- disc 30 → **1**
- tip 30 → **1**  
- claws 120 → **1**
- 총 180 draw call → **3 draw call** (98% 감소)

**복잡도:** 머티리얼 셰이더 onBeforeCompile 패치 필요 → 구현 난이도 중상. 4.1~4.3을 먼저 적용한 후 효과가 부족하면 진행.

### 4.5 CanvasTexture 공유 아틀라스 / 제거

현재: top마다 256×256 Canvas 생성 → 30개 = 30개 GPU 텍스처

**개선 옵션 (택1):**
- (간단) decal을 제거하고 disc 머티리얼의 `emissive` 색상만으로 표현.
- (고급) 단일 512×512 아틀라스 캔버스에 모든 decal 타일 배치 후 UV 오프셋으로 구분.

InstancedMesh와 함께라면 옵션 1이 자연스럽게 강제됨 (instance마다 텍스처를 다르게 줄 수 없음).

### 4.6 ExtrudeGeometry 품질 축소 (LOD)

```js
// 현재
{ bevelSegments: 1, curveSegments: 8 }

// 개선 — 성능 우선 모드 (10명 이상 시 자동 전환)
{ bevelEnabled: false, curveSegments: 4 }
```

`config.js`에 참가자 수에 따른 LOD 설정 추가:
```js
export function getGeometryQuality(participantCount) {
  if (participantCount <= 8)  return { bevel: true,  curveSegs: 8  };
  if (participantCount <= 16) return { bevel: true,  curveSegs: 5  };
  return                             { bevel: false, curveSegs: 3  };
}
```

### 4.7 Physics 서브스텝 동적 조정

```js
// physics.js — 참가자 수에 따라 substep 조정
const substeps = participantCount > 20 ? 1 : participantCount > 12 ? 2 : 3;
Matter.Runner.run(runner, engine); // runner.delta 조정
```

### 4.8 Label 최적화

현재: 모든 top에 Sprite label 상시 표시

개선:
- 배틀 중 마지막 5명 남을 때만 label 표시
- 라벨 canvas 크기 128×48 (현재 256×72의 절반 이하)

---

## 5. 모바일 반응형 개선

### 5.1 레이아웃 전략

| 화면 크기 | Setup | Game |
|-----------|-------|------|
| Desktop (≥1024px) | 중앙 패널, 좌우 분할 | 우측 사이드 스트립 |
| Tablet (768–1024px) | 전체 너비 싱글 칼럼 | 하단 접이식 탭 |
| Mobile (<768px) | 풀스크린 시트 (스크롤) | Bottom Sheet 미니 HUD |

### 5.2 Mobile Setup 레이아웃

```
┌──────────────────────┐
│  METAL BLADE  [🔊]   │  ← 40px 헤더
├──────────────────────┤
│                      │  ← Three.js canvas (배경, 50vh)
│   [팽이 idle 프리뷰] │
│                      │
├──────────────────────┤
│  TITLE ____________  │  ← 셋업 시트 (50vh, 스크롤 가능)
│  Name ____________   │
│  [+] [CSV] [Shuffle] │
│  ─────────────────── │
│  • 이름1      [×]    │
│  • 이름2      [×]    │
│  ─────────────────── │
│  [  BATTLE START  ]  │  ← 하단 고정 버튼
└──────────────────────┘
```

### 5.3 Mobile Game 레이아웃

```
┌──────────────────────┐
│ [⚙]    00:28   [🔊] │  ← 44px HUD
├──────────────────────┤
│                      │
│                      │
│   Three.js canvas    │  ← 최대 높이 확보
│   (게임 집중)        │
│                      │
│                      │
├──────────────────────┤
│ N REMAINING  [목록▲] │  ← 하단 바 (44px)
└──────────────────────┘
   ↓ [목록▲] 탭 시
┌──────────────────────┐
│ N REMAINING  [목록▼] │
├──────────────────────┤
│ • 이름1 ●           │  ← Bottom Sheet (30vh)
│ • 이름2 ●           │  (터치로 dismiss)
│ • 이름3 ●           │
└──────────────────────┘
```

### 5.4 터치 타겟 최소 사이즈

- 모든 버튼: `min-height: 44px`, `min-width: 44px`
- 참가자 remove 버튼: 모바일에서 상시 표시 (hover 없음)
- 인풋 필드: `font-size: 16px` (iOS 자동 줌 방지)

### 5.5 Media Query 구조

```css
/* Base: Desktop */
/* ... */

@media (max-width: 1023px) {
  /* Tablet */
}

@media (max-width: 767px) {
  /* Mobile */
  /* setup: fullscreen sheet */
  /* game: bottom HUD strip */
}

@media (max-width: 767px) and (orientation: landscape) {
  /* Mobile landscape: canvas 100%, HUD overlay */
}
```

---

## 6. 구현 우선순위

### Phase 1 — 필수 (1주차)

성능 최적화는 **머티리얼 → 조명 → UX → 비주얼** 순으로 진행. 머티리얼 변경이 가장 큰 비용 절감을 제공하면서 코드 변경은 가장 작음.

| 순서 | 작업 | 파일 | 기대 효과 |
|------|------|------|-----------|
| **1** | **disc 머티리얼 `transmission` 제거 → `MeshStandardMaterial`** | `tops.js` | **이중 렌더 패스 제거 (최대 효과)** |
| **2** | **`MeshPhysicalMaterial` → `MeshStandardMaterial` 일괄 전환** (claws, core, handle, tip) | `tops.js` | PBR 셰이더 비용 30~40% 감소 |
| **3** | PointLight 제거 → HemisphereLight 공유 | `tops.js`, `scene.js` | 라이트 30개 → 0개 |
| 4 | Setup Screen 분리 (`#setup-panel`) | `index.html`, `style.css`, `ui.js` | UX 플로우 개선 |
| 5 | 배경 비네트 CSS + 아레나 동심원 grid | `style.css`, `stadium.js` | 비주얼 즉시 개선 |
| 6 | 모바일 Media Query 재작성 | `style.css` | 모바일 대응 |

> **참고:** 1~3번은 모두 `tops.js` 한 파일 안에서 끝나는 작업. 30분~1시간 내 적용 가능하며, 그것만으로 30명 시 FPS가 체감 가능 수준으로 회복될 가능성이 높음. 이후 Phase 2의 InstancedMesh 도입 여부는 1~3 적용 후 측정해서 결정.

### Phase 2 — 권장 (2주차)

| 순서 | 작업 | 파일 | 기대 효과 |
|------|------|------|-----------|
| 7 | InstancedMesh 도입 (disc + tip + **claws 포함**) | `tops.js` | draw call 180 → 3 |
| 8 | 참가자 사이드 스트립 + Bottom Sheet | `index.html`, `style.css`, `ui.js` | 게임 중 UI 최소화 |
| 9 | 폰트 교체 (Rajdhani + Space Mono) | `index.html`, `style.css` | 브랜드 디자인 레벨업 |
| 10 | 팝업 인풋 모드 | `index.html`, `style.css`, `ui.js` | 유연한 인풋 루트 |

### Phase 3 — 개선 (3주차)

| 순서 | 작업 | 파일 | 기대 효과 |
|------|------|------|-----------|
| 11 | LOD 기반 Geometry 품질 | `tops.js`, `config.js` | 고참가자 수 대응 |
| 12 | CanvasTexture 제거 (decal → emissive로 단순화) | `tops.js` | GPU 텍스처 30개 절감 |
| 13 | 아레나 바닥 반사 머티리얼 | `stadium.js` | 시각 품질 |
| 14 | 컬러 토큰 CSS 변수 전환 | `style.css` | 유지보수성 |

---

## 7. 변경 파일 목록

```
index.html          — setup-panel, side-strip, popup-modal HTML 추가
style.css           — 컬러 토큰 변수화, 컴포넌트 재작성, media query 재작성
js/
  config.js         — getGeometryQuality() LOD 헬퍼 추가
  state.js          — phase에 'setup' 추가
  scene.js          — HemisphereLight 추가, fog 설정
  stadium.js        — 아레나 바닥 그리드, 동심원, 반사 플레인 추가
  tops.js           — MeshPhysicalMaterial→MeshStandardMaterial 일괄 전환,
                     transmission 제거, PointLight 제거, InstancedMesh 도입, LOD 적용
  particles.js      — 앰비언트 드리프트 파티클 추가
  ui.js             — Setup/Game 화면 전환 로직, 팝업 인풋 모드, Bottom Sheet
  game.js           — 'setup' 페이즈 처리 추가
```

---

## 8. 디자인 레퍼런스 요약 (DESIGN-bugatti.md 적용)

| 원칙 | Metal Blade 적용 |
|------|-----------------|
| 순수 블랙 캔버스 | `#000000` ~ `#0d0d0d` 배경, Three.js 씬이 유일한 비주얼 볼륨 |
| 투명 아웃라인 버튼 (pill) | `border-radius: 9999px`, `background: transparent`, `border: 1px solid` |
| 폰트 트리니티 | Display 헤드라인(Rajdhani) / Body(Inter) / Mono UI(Space Mono) |
| bold 없음 | 모든 웨이트 400 또는 300, 강조는 크기·트래킹으로 |
| 데코레이션 없음 | 배경 장식 대신 Three.js 팽이 자체가 비주얼 볼륨 |
| 와이드 레터스페이싱 | 버튼 `letter-spacing: 2.5px`, 캡션 `letter-spacing: 2px` |
| 섹션 화이트스페이스 | Setup 패널 내부 여백 40px+, 게임 HUD는 극단적 최소화 |
