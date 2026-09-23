---
title: "VTZero"
titleKo: ""
date: 2026-06-27
deck: ""
type:
tags: []
draft:
---

# 개요
Virustotal의 vt-py를 활용하여 유의미한 데이터(국가, 소유자, 유해정도) 추철 및 대량 검색기능 제공

https://github.com/sqzer-x/VTZero

# 필요조건
VirusTotal API 키 필요
API키는 회원가입 하면 자동으로 발급이 되며 키는 `https://www.virustotal.com/gui/user/<Username>/apikey`에서 확인할 수 있다.

# 설정
1. Repo clone
```bash
git clone https://github.com/sqzer-x/VTZero.git
cd your-repo
```

2. 의존성 설치
```bash
pip install -r requirements.txt
```

3. 최초 실행시 API값 입력
```bash
python VTZero.py
Please enter your VirusTotal API key:
```

# 사용법
1. 웹 브라우저에서 http://127.0.0.1:5000 접속
2. IP 주소를 입력하고(한줄에 하나씩) 제출하면 각 IP에 대한 정보를 얻을 수 있음
3. 유해 값이 1 이상이면 해당 값은 빨간색으로 표시