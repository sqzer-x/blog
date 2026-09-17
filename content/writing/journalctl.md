---
title: "journalctl"
date: 2025-12-07
tags: []
---

# journalctl

- 리눅스 시스템의 systemd 가 관리하는 모든 로그를 조회하고 검새하는 도구
- 과거에는 /var/log/syslog, /var/log/auth.log 등 테스트 파일을 일일이 열어봐야 했지만, 이제는 journalctl 명령어 하나로 통합 관리

## **journalctl -e** VS **journalctl -b -1 -e**

두 명령어의 가장 큰 차이는 로그를 보는 시점(Timeframe) 이다.

| 명령어 | journalctl -e | journalctl -b -1 -e |
| --- | --- | --- |
| 의미 | 현재 부팅(current Boot) 로그의 끝부분 | 직전 부팅(Last Boot)로그의 끝부분 |
| 탐색 범위 | 부팅된 순간(0) -> 현재 시점 | 직전 부팅 시작 ~ 직전 부팅 종료(Crash) |
| 사용 예 | 서비스 재시작 후 에러 확인, 실시간 모니터링 | 커널 패닉, 정전, 하드웨어 오류로 인한 비정산 재부팅 원인 |

### 상세 분석

- journalctl -e
  - (Pager End): 스크롤을 맨 아래(최신)로 내려서 보여준다.
  - 기본적으로 현재 부팅된 세션의 로그를 보여준다.
- journalctl -b -1 -e
  - -b -1 (Boot offset -1): 현재(0) 말고 바로 전(-1) 부팅 기록

### journalctl 필수 옵션

#### 실시간 감시 (-f)

새로운 로그가 들어오면 계속 화면에 출력한다.

```bash
$ journalctl -f
```

#### 특정 서비스만 보기 (-u)

특정 서비스(Ex. ssh, tailscale)만 선택하여 확인한다.

```bash
$ journalctl -u ssh
```

#### 커널 메시지만 보기 (-k)

하드웨어 오류(랜카드, 디스크), 방화벽 차단 로그 등은 주로 커널(Kernel) 이 남긴다.

```bash
$ journalctl -k
```

#### 시간 범위 지정 (--since, --until)

특정 시간에 발생한 사건을 조회

```bash
$ journalctl --since "2024-12-07 14:00:00" --until "2024-12-07 15:00:00"
$ journalctl --since "1 hour ago"  # 1시간 전부터 지금까지
```

#### 에러만 보기 (-P)

정보(Info) 로그는 무시하고, 오류(Error)나 경고(Warning) 등 심각한 것만 확인

```bash
$ journalctl -p err   # 에러(3) 등급 이상만 표시
```

### 로그 영구 저장 설정(비휘발성)

#### 설정 파일 열기

```bash
$ sudo vim /etc/systemd/journald.conf
```

#### 옵션 수정

```vi
[Journal]
Storage=persistent
SystemMaxUse=500M
```

- Storage=persistent : 하드디스크에 영구 저장
- SystemMaxUse=500M : 로그 파일이 너무 쌓여서 디스크를 꽉 채우지 않게 최대 500MB까지만 저장

#### 서비스 재시작

```bash
$ systemctl restart systemd-journald
```

#### 적용 확인

```bash
$ ls -d /var/log/journal
/var/log/journal
```

### References

1. https://www.freedesktop.org/software/systemd/man/latest/journalctl.html
2. https://manpages.ubuntu.com/manpages/noble/en/man1/journalctl.1.html
3. https://wiki.archlinux.org/title/Systemd/Journal
