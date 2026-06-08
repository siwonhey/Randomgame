# 결과 페이지 — COPY 텍스트 예시

결과 화면의 **COPY RESULTS** 버튼을 누르면 클립보드에 복사되는 텍스트 포맷입니다.
(소스: `js/ui.js`의 `copyResults()`)

- 모든 줄은 앞에 공백 1칸으로 시작합니다.
- 1위는 `🏆 WINNER`로 표시, 2위부터는 영문 서수(`2nd. 3rd. 4th. …`)로 나열합니다.
- 제목 미입력 시 `BLITZ BATTLE`로 대체됩니다.
- 마지막 줄 `Play BLITZ Now`에서 **'BLITZ' 단어**에 `https://randomgame-7pg4.vercel.app/` 링크가 걸립니다.

---

## 포맷 (템플릿)

```
 ─── BLITZ : REPORT ───
 {제목}

 🏆 WINNER {1위 이름}

 2nd. {2위 이름}
 3rd. {3위 이름}
 4th. {4위 이름}
 ...

 ──────────────────────
 ▶ Play [BLITZ](https://randomgame-7pg4.vercel.app/) Now
```

---

## 실제 예시 (참가자 6명, 제목 "팀 점심 내기")

```
 ─── BLITZ : REPORT ───
 팀 점심 내기

 🏆 WINNER 오시원

 2nd. 김민준
 3rd. 이서연
 4th. 박지후
 5th. 최예은
 6th. 정하늘

 ──────────────────────
 ▶ Play [BLITZ](https://randomgame-7pg4.vercel.app/) Now
```

> 마크다운을 지원하는 앱(슬랙·노션 등)에서는 마지막 줄이 **Play BLITZ Now** 로 보이고, **BLITZ** 를 누르면 게임 링크로 이동합니다.
