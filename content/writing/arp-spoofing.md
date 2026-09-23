---
title: "ARP Spoofing"
titleKo: ""
date: 2024-11-05
deck: ""
type:
tags: []
draft:
---

**ARP**(주소 결정 프로토콜, Address Resolution Protocol)의 취약점을 악용하여 네트워크 통신을 가로채거나, 변조하는 행위. 공격자는 잘못된 ARP 응답을 통해 자신이 신뢰할 수 있는 다른 호스트인 것처럼 속이고, 이를 통해 트래픽을 훔치거나 수정할 수 있다.

## How ARP spoofing works

ARP Spoofing 은 공격자가 네트워크 상에서 잘못된 ARP 응답을 전송하여, 다른 장치들이 자신의 MAC 주소를 신뢰할 수 있는 장치(예: 게이트웨이, 서버 등)의 MAC 주소로 잘못 인식하게 만든다. 이로 인해, 공격자는 네트워크 트래픽을 가로채거나 변조할 수 있다.

### 공격자가 잘못된 ARP 응답을 보냄

공격자는 피해자 장치와 게이트웨이(또는 네트워크 상의 다른 중요한 장치)에게 잘못된 ARP 응답을 전송하여, 자신의 MAC 주소를 상대방이 원하는 장치의 MAC 주소로 속인다.  
Example. 공격자는 게이트웨이에게 자신의 MAC 주소를 피해자의 IP 주소와 연결된 것으로 알려주고, 동시에 피해자에게 자신의 MAC 주소를 게이트웨이의 IP 주소와 연결된 것으로 알려준다.

![](/uploads/network-security-arp-spoofing/image.png)

*타겟 호스트(172.16.36.12)와 L2 SW Gateway(172.16.36.1)을 상대로 arp spoofing*

![](/uploads/network-security-arp-spoofing/image-1.png)

*공격 전 target host의 MAC Address*

![](/uploads/network-security-arp-spoofing/image-2.png)

*공격 후 target host의 MAC Address (Attacker host의 MAC Address 로 변경된 것 확인)*

![](/uploads/network-security-arp-spoofing/image-3.png)

*Attacker host의 MAC Address*

![](/uploads/network-security-arp-spoofing/image-4.png)

*ARP Apoofing 공격 패킷*

![](/uploads/network-security-arp-spoofing/image-5.png)

*ARP Apoofing 공격 패킷*

![](/uploads/network-security-arp-spoofing/image-6.png)

![](/uploads/network-security-arp-spoofing/image-7.png)

*공격 성공 후 target host에서 nas(91.212.102.100:5000) 와 naver.com 에 접근하려는 요청 트래픽 Attacker host에서 확인 완료*

트래픽이 Attacker host로 들어오지만 따로 포트포워딩을 설정하지 않아 Attacker host에서 트래픽이 멈춰버린다.

정확한 MITM 공격을 구현하려면 트래픽이 멈추는것을 방지하기 위해 포트포워딩 설정을 하여 트래픽이 실제 게이트웨이로 다시 전달해줘야 한다.

![](/uploads/network-security-arp-spoofing/image-8.png)

![](/uploads/network-security-arp-spoofing/image-9.png)

*공격 종료 후 ARP Cache table에서 target host의 MAC Address가 정상적으로 돌아온것을 확인 할 수 있다.*

### 피해자와 게이트웨이의 ARP 캐시 변경

공격자의 잘못된 ARP 응답을 받은 피해자와 게이트웨이는 공격자의 MAC 주소를 게이트웨이 또는 피해자의 IP 주소에 연결된 것으로 인식함. 이로 인해, 피해자의 트래픽이 공격자를 통해 전달.

### 트래픽 가로채기 또는 변조

공격자는 피해자의 모든 네트워크 트래픽을 가로챌 수 있다. 가로챈 트래픽을 단순히 모니터링할 수 있고, 변조하여 원하는 대로 조작할 수도 있다. 이를 **Main in the middle 공격**(중간자 공격) 이라고 부르며, 공격자는 중간에서 트래픽을 가로채서 읽고, 변조한 뒤, 다시 게이트웨이로 보내 정상적으로 통신이 이루어지는 것처럼 속일 수 있다.

## Effects of ARP spoofing

1. Man-in-the-Middle 공격 (MITM) : 공격자는 중간에서 트래픽을 가로채어 내용을 읽고, 변조할 수 있다. 이를 통해 중요한 정보(비밀번호, 쿠키, 세션 토큰 등)를 탈취할 수 있다.
2. 서비스 거부 공격(DoS) : 공격자는 ARP Spoofing을 통해 네트워크 상의 특정 장치에 대한 트래픽을 차단하거나, 특정 장치가 게이트웨이와의 통신을 할 수 없게 만들어 네트워크에 장애를 일으킬 수 있다.
3. 트래픽 재전송 : 공격자는 트래픽을 가로챈 뒤, 원래 목적지로 트래픽을 다시 보내 피해자가 공격 사실을 알아차리지 못하게 할 수 있다.

## How to defend against ARP spoofing

1. 동적 ARP 검사(Dynamic ARP Inspection, DAI) : 네트워크 스위치에서 ARP 트래픽을 모니터링하여, 의심스러운 ARP 패킷을 필터링한다. 이를 통해, 잘못된 ARP 요청이나 응답이 네트워크에 전달되지 않도록 할 수 있다.
2. ARP 캐시 고정(Static ARP Entries) : 중요한 장치(Ex. Gateway)에 대해 고정된 ARP 엔트리를 설정하여, 잘못된 ARP 정보가 캐시에 추가되지 않도록 할 수 있다. 다만, 큰 네트워크에서는 관리가 복잡할 수 있다.
3. 암호화 사용(HTTPS, SSH) : ARP 스푸핑 공격을 통해 중간에서 데이터를 가로채더라도, 암호화된 통신을 사용하면 데이터를 탈취당하더라도 해독할 수 없다.
4. VPN 사용 : 가상 사설망(VPN)을 사용하면, 클라이언트와 서버 간의 모든 트래픽이 암호화되기 때문에 ARP 스푸핑 공격을 통해 데이터를 탈취하더라도 내용을 확인 할 수 없음.
