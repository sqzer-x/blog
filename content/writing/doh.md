---
title: "DoH(DNS over HTTPS)"
date: 2024-11-08
tags: []
---

Securelist의 [SteelFox Trojan 분석 보고서](https://securelist.com/steelfox-trojan-drops-stealer-and-miner/114414/?ref=openpesto.com)에서 C2서버와 피해호스트 통신 과정에서 DoH라는 기술을 이용하여 도메인 조회 과정을 숨기는 페이로드를 구현했다는 내용이 있어서 DoH 기술에 대해 알아보았다.

## DoH(DNS over HTTPS)

웹 트래픽을 통해 DNS 요청을 암호화하여 보호하는 프로토콜이다. 이 프로토콜은 전통적인 DNS 요청을 HTTP로 암호화해 전송하므로, DNS 요청을 외부에서 가로채거나 조작하는 공격으로부터 보호하는 장점이 있다.

### DNS over HTTPS의 주요 개념과 동작 방식

1. DNS 요청의 기본 원리 • DNS(Domain Name System)는 웹 주소(예: google.com)를 IP 주소(예: 142.250.74.14)로 변환하여 서버와의 연결을 가능하게 한다. • 기존 DNS 요청은 일반적으로 암호화되지 않은 상태로 전송되기 때문에 가로채기나 조작이 가능한 위험있다.
2. DoH의 암호화 방식 • DoH는 HTTPS(포트 443) 를 통해 DNS 요청을 전송하여 모든 요청을 암호화한다. • 이를 통해 제 3자가 DNS 요청을 볼 수 없으며, 사용자의 웹 브라우징 기록이나 위치 정보 등을 추적하는 것을 어렵게 만든다.
3. DoH의 동작 원리 • DoH를 사용하는 브라우저나 애플리케이션은 HTTPS를 통해 도메인 이름을 IP 주소로 변환하는 요청을 전송한다. • 이 요청은 DoH 서버(예: Google DNS, Cloudflare, Mozilla에서 제공하는 서버)에 전달되며, 서버는 응답을 HTTPS로 암호화해 되돌려준다.

### DoH의 장점

1. 보안 강화 • DoH는 암호화된 연결을 통해 DNS 요청을 전송하므로, 스누핑이나 MITM(Man-In-The-Middle) 공격으로부터 보호된다. • ISP나 네트워크 관리자 등이 사용자의 DNS 트래픽을 추적하거나 조작할 수 없다.
2. 프라이버시 보호 • DNS 요청이 HTTPS로 암호화되기 때문에 사용자의 인터넷 사용 기록을 외부에서 추적하기 어려워진다. • 특히 공용 네트워크에서 사용자의 브라우징 프라이버시를 보호할 수 있다.
3. 검열 회피 • DoH는 HTTPS 트래픽과 구분되지 않기 때문에, 특정 DNS 요청을 차단하려는 검열 정책을 우회하는데 도움이 될 수 있다.

### DoH의 단점

1. 지연 시간 증가 • HTTPS 암호화 및 복호화 과정이 추가되므로, 전통적인 DNS에 비해 응답 시간이 조금 느려질 수 있다.

### DoH 활성화 방법

- 웹 브라우저에서 활성화
  - Google Chrome과 Mozilla Firefox 등에서는 DoH를 직접 활성화할 수 있는 옵션을 제공한다.
  - Mozilla Firefox 기준: 설정 > 개인 정보 및 보안 > 다음을 사용하여 DNS over HTTPS 활성화 > 최대 보호
- 운영 체제에서 활성화
  - Windows 11 이상에서는 시스템 DNS 설정에서 DoH를 설정할 수 있으며, macOS나 Linux의 경우 네트워크 설정을 통해 설정이 가능하다.
  - Windows 11 기준: Settings > Network & internet > Ethernet > Edit DNS settigs > Preferred DNS 1.1.1.1(Cloudflare) 로 설정 > DNS over HTTPS On(automatic template) > Alternate DNS 1.1.1.2(Cloudflare) 로 설정 > DNS over HTTPS On(automatic template)

### DoH 상태 확인 방법

- Cloudflare DoH 테스트: https://1.1.1.1/help
- Google DoH 테스트: https://dns.google/

![](/uploads/network-security-doh-dns-over-https/image-16.png)

*DoH ON*

![](/uploads/network-security-doh-dns-over-https/image-17.png)

*DoH OFF*
