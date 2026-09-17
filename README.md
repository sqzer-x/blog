# blog.sqzer.com

개인 연구 노트. Astro 로 짓고 GitHub Actions 가 GitHub Pages 에 배포한다.

## 글 쓰기

```bash
cp content/_template.md content/writing/my-post.md   # 또는 직접 생성
npm run dev
```

`content/writing/<slug>.md` 하나가 글 하나다. 파일명이 곧 URL 슬러그이고,
발행 주소는 front matter 의 `date` 에서 연도를 따 **`/writing/<year>/<slug>/`** 가 된다.

```yaml
---
title: ""        # 필수
titleKo: ""      # 한글 원제 보존용, 선택
deck: ""         # 인덱스에 제목과 함께 나오는 한 문장. 비어 있어도 빌드는 통과한다
date: 2026-09-17 # 필수. YYYY-MM-DD
type: essay      # essay | research — 하위 메뉴가 이 값으로 갈린다
tags: []
draft: true      # true 면 빌드에서 제외된다
---
```

초안은 **로컬에 두고 완성됐을 때 push** 한다. 이 저장소는 공개다.

이미지는 `public/uploads/` 에 두고 본문에서 `/uploads/...` 로 참조한다.

## 배포

`main` 에 push 하면 Actions 가 빌드해 Pages 로 올린다. 빌드 앞에 콘텐츠 게이트가 걸려 있어
(`npm run prebuild`) 스키마 위반·URL 충돌·없는 이미지 참조가 있으면 **배포되지 않는다.**

```bash
npm run check    # 게이트만 따로 돌리기
npm run build    # 게이트 + 빌드
```

게이트 엄격도는 워크플로의 `CONTENT_STRICT` 로 조절한다. 지금은 `urls,schema` 이고,
덱·태그 백필이 끝나면 `all` 로 올린 뒤 다시 내리지 않는다.

## 설계 메모

- 정식 URL 은 전부 트레일링 슬래시로 끝난다
- URL 슬러그는 **ASCII 만** 소문자화한다(한글 파일명은 그대로 살린다)
- 목록 정렬은 `date DESC → Intl.Collator('en') title → path` — DB·파일시스템 순서에 맡기지 않는다
- 연도를 URL 에 넣는 이유는 `essay`·`research` 같은 하위 뷰 이름과 슬러그가 충돌하지 않게 하기 위해서다
