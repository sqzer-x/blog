---
title: "Promox 먹통 Troubleshooting"
date: 2025-12-03
tags: []
---

몇달 전부터 계속해서 Promox 와 Promox에서 돌아가고 있는 VM들의 서비스에 접근이 안되는 문제가 발생했다.

정확한 이슈는 다음과 같다.

- Promox 서버 자체에 GUI, SSH 접근 불가
- Promox 서버 내의 VM과 서비스들 접근 불가 및 네트워크 오류
- 웹 애플리케이션은 클라우드 터널링 떨어진것 확인
- 위와 같은 이슈가 발생하면 물리적 전원 버튼을 눌러 시스템을 재부팅 하고 VM 서버들을 재부팅하면 접근 정상화, 서비스 정상화가 됨.
- 하지만 몇일 지나지 않아 똑같은 이슈가 지속적으로 발생

Promox 에서[“journalctl -e” or “journalctl -b -1 -e”](https://openpesto.com/etc-systemd-journalctl/)명령어로 시스템이 죽기직전 로그를 확인해본 결과 로그 내에 별다른 이슈 없었음.

그렇다면 시스템이 한순간에 Freeze 된 상태가 된것으로 판단.

서버에서 사용중인 **Intel I219-LM 칩셋 랜카드와 리눅스 기본 드라이버인 e1000e 사이에 유명한 TCP Offload(부하 분산) 버그가 있는것으로 확인.**[**[1]**](https://bugzilla.kernel.org/show_bug.cgi?id=118721&ref=openpesto.com)[**[2]**](https://forum.proxmox.com/threads/intel-nic-e1000e-hardware-unit-hang.106001/?ref=openpesto.com)[**[3]**](https://sourceforge.net/p/e1000/bugs/572/?ref=openpesto.com)

해당 버그를 쉽게 설명하면 랜카드가 "내가 CPU 대신 이 데이터를 처리해 줄게!"라고 나섰다가, 감당하지 못하고 그냥 뻗어버리는 현상.

원인은 해당 로그에서 확인할 수 있었음.

```bash
$ lspci | grep -i ethernet
Dec 02 23:21:58 devastator kernel: e1000e 0000:00:1f.6 eno2: Detected Hardware Unit Hang:
```

- 해석: 리눅스 커널이 eno2라는 이름의 네트워크 장치(인텔 I219-LM)가 "하드웨어적으로 멈췄음(Hang)"을 감지
- 상황: 랜카드가 멈추니 네트워크가 끊기고, Tailscale(VPN)도 연결이 끊어지며(controlhttp: context aborted), 시스템 전체가 네트워크 불능 상태에 빠진 것

### 해결 방법 (TCP Offload 끄기)

랜카드가 무리하지 않도록 "너는 그냥 데이터만 전달해, 처리는 CPU가 할게"라고 설정을 바꿈.

A. ethtool 설치

```bash
$ apt update && apt install ethtool -y
```

B. TCP Offload 끄기

```bash
$ ethtool -K eno2 tso off gso off
```

C. 재부팅 해도 유지되도록 설정 (영구 적용)

C.1 네트워크 설정 파일 열기

```bash
$ vim /etc/network/interfaces
```

C.2 iface eno2(네트워크 인터페이스 이름) inet ... 라고 적힌 부분 찾기

C.3 해당 설정 블록 바로 아래줄에 다음 내용 추가 (들여쓰기)

```bash
 $ post-up ethtool -K eno2 tso off gso off
```

Ex)

```plaintext
auto eno2
iface eno2 inet manual
    post-up ethtool -K eno2 tso off gso off
```

### 요약

해당 이슈는 **하드웨어(Intel I219)가 주장하는 스펙**과 **리눅스 드라이버(e1000e)가 보내는 데이터**간의 불일치로 인해 발생하였다.

1. 원인: 리눅스 커널은 CPU 부하를 줄이기 위해 패킷 분할(Segmentation) 작업을 랜카드에 떠넘긴다. (TSO: TCP Segmentation Offload)
2. 버그: 하지만 I219 칩셋의 특정 리비전은 버퍼 관리 미흡으로 인해, 과도한 TSO 요청이 들어오면 DMA 컨트롤러가 꼬이면서 칩셋 자체가 멈춰버린다. (Hang)
3. 해결: ethtool -k eno2 tso off gso off 명령어는 커널에게 "이 랜카드의 TSO, GSO 기능을 사용하지 말고 CPU가 직접 패킷을 쪼개서 보내" 라고 지시하는 것

## References

[1] [https://bugzilla.kernel.org/show_bug.cgi?id=118721](https://bugzilla.kernel.org/show_bug.cgi?id=118721&ref=openpesto.com)

[2] [https://forum.proxmox.com/threads/intel-nic-e1000e-hardware-unit-hang.106001/](https://forum.proxmox.com/threads/intel-nic-e1000e-hardware-unit-hang.106001/?ref=openpesto.com)

[3] [https://sourceforge.net/p/e1000/bugs/572/](https://sourceforge.net/p/e1000/bugs/572/?ref=openpesto.com)
