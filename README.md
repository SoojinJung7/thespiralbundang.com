# thespiralbundang.com

더 스파이럴 분당(THE SPIRAL) 사이트. 2026-11에 Wix에서 정적 사이트로 옮겼고, Vercel에서 서비스합니다.

## 구조

- `site/` — 배포되는 정적 파일 전체 (빌드 없음)
  - `site/<경로>/index.html` — 데스크톱 레이아웃 (Wix 렌더 결과 스냅샷)
  - `site/m/<경로>/index.html` — 모바일 레이아웃 (Wix 모바일 사이트 스냅샷)
  - `site/assets/` — 이미지·폰트·CSS·영상 (원본 Wix CDN에서 받아 온 파일)
  - `site/js/site.js` — Wix 런타임 대신 쓰는 작은 스크립트 (등장 애니메이션, 드롭다운/모바일 메뉴, 슬라이드쇼, 갤러리 자동 흐름, 3D 캐러셀, 영상 플레이어)
  - `site/css/site.css` — 추가 스타일
- `middleware.js` — 휴대폰 접속이면 `/m/...` 레이아웃을 보여 줌 (주소는 그대로). `?view=mobile` / `?view=desktop`으로 강제 확인 가능
- `vercel.json` — 출력 폴더, `/forum` 리다이렉트, 캐시 헤더
- `scripts/snapshot.mjs` — Wix 원본을 스냅샷하던 일회성 스크립트 (Wix 해지 후에는 다시 돌릴 수 없음)
- `scripts/states.mjs` — 메뉴 등 상호작용 전후 DOM 차이를 녹화 (스냅샷 때 사용)
- `scripts/preview.mjs` — 로컬에서 서버 없이 `site/`를 헤드리스 크롬으로 열어 스크린샷

## 내용 수정

텍스트는 `site/<경로>/index.html`(데스크톱)과 `site/m/<경로>/index.html`(모바일) **두 곳 모두** 고쳐야 합니다.
Wix 마크업이라 길지만, 바꿀 문구로 검색하면 바로 찾을 수 있습니다.

## 원본에서 뺀 것 (Wix 전용 기능)

- Wix 채팅 위젯, 모바일 빠른 작업 바(…)
- 교육스케줄 달력 위젯 (`/general-8`의 Events Calendar)
- Wix 포럼 (`/forum` → `/` 리다이렉트)
- 상점 장바구니/결제 (원래도 "교육 신청하기"는 구글폼 링크)
