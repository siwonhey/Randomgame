# 수정 방향
- 현재 프로젝트는 “새로운 디자인 제안”이 목적이 아니라, 첨부된 레퍼런스 UI를 실제 서비스 수준으로 정확하게 재구성하는 작업이다.

- 따라서 기존 팽이 오브젝트, 물리 로직, 카메라 로직은 절대 수정하지 않는다.
UI만 교체 및 재구성한다.
- 레퍼런스 이미지 기반으로 spacing system / typography scale / alignment / component proportion 을 최대한 동일하게 유지한다.

- 첨부 이미지의 UI 디자인을 상세하게 파악 후 적극 반영하도록 한다.
    - 랜딩 페이지: **Landing.jpg**
    - 인풋 페이지: **INPUT_MO.jpg** / **INPUT_PC.jpg'**
    - 결과 페이지: **RESULT.JPG**
- 사용 폰트: Hanken Grotesk(본문), Space Grotesk(타이틀)


*주의 사항*
* 전체 UI 구조와 요소 배치 유지
* 패딩, 간격, 정렬 방식 동일하게 유지
* 버튼 크기와 비율 유지
* 타이포그래피 계층 구조 유지
* 불필요한 요소 추가 금지
* 다른 스타일로 재해석하지 말고 원본 기반으로 제작
* 화면 가장자리 여백 유지
* 아이콘 스타일 통일
* “참고” 수준이 아니라 원본 디자인의 구성과 분위기를 최대한 그대로 유지해줘.
* 요소 위치를 임의로 바꾸지 말 것


## 1. 페이지 진입 로직 #
랜딩페이지 > 인풋 페이지 > 게임 페이지 > 결과 페이지


# 페이지 구성 
## 1-1. 랜딩 페이지 ##
- 로고 애니메이션(**LOGO.gif**) 1차례 재생 후 인풋 게임 화면으로 진입
- 모노톤 다이아몬드 그라데이션 배경 위 애니메이션 재생(ui 디자인 **'Landing.jpg'** 적용)
- 게임 후, restart 클릭시에는 로고 애니메이션이 재생 되지 않고, 새로고침시에 재생

## 1-2. 인풋 페이지 (팝업 형태) ##
- 반응형으로, **'INPUT_MO.jpg'** / **'INPUT_PC.jpg'** 레이아웃 및 디자인 그대로 적용
- csv upload, shuffle 버튼의 **도움말 아이콘** 호버 시, 기능에 대한 간단 설명이 아이콘 주변에 팝업 형태로 제시됨
- 참가자 옆에는 참가자에 **배정된 팽이 색상**이 이름 왼쪽에 원형 형태로 노출
- 입력된 **참가자의 전체 수**는 PARTICIPANTS 타이틀 옆에 **태그 형태로 노출**
- 참가자 입력은 **왼쪽 위에서 아래** 순서로 채워지며, 10명 초과시 오른쪽 열에 이어서 입력되는 구조
- 우측 상단에 음소거 버튼
- 타이틀 미 입력시, 입력창에 **경고 메시지** 붉은 톤으로 제시
- 좌측 상단의 로고는 **'INPUT_MO.jpeg'** / **'INPUT_PC.jpeg'** 를 참고하여 위치를 잡고, 로고는 **'LOGO.png'** 파일을 사용하도록 한다.


## 1-3. 게임 페이지 ##
- 인풋화면에서 START GAME 클릭 시 진입
- 인풋페이지에서 팝업이 꺼지고 게임 스테이지 노출된 상태
- 우측 하단에 입력된 참가자 리스트 **한줄로 노출**

## 1-4. 결과 페이지 ##
- **'RESULT.JPG'** UI 디자인 참고


If there is any conflict between “better UX” and the provided reference images, prioritize the reference images.

Preserve original layout proportions and visual hierarchy as closely as possible.
Do not redesign.
Replicate faithfully.