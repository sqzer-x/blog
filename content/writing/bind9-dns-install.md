---
title: "Bind 9 DNS Server 설치"
date: 2024-11-05
tags: []
---

AWS Lightsail Amazon linux 인스턴스 호스트에 BIND 9 DNS Server 설치 후 설정까지 진행 해봤다.

## BIND 9 설치 및 기본 설정

**패키지 매니저 업데이트**

```bash
sudo yum update -y
```

**BIND 9 설치**

```bash
sudo yum install -y bind bind-utils
```

**BIND 9 설정**

```bash
sudo vi /etc/named.conf
```

**모든 IP에서 쿼리를 허용**

```
allow-query { any; };
```

**IPv6 주소에서 요청을 수신하지 않도록 설정**

```
options {
    listen-on-v6 { none; };
};
```

## 보안 옵션 설정

### DNSSEC (DNS Security Extensions) 사용

DNSSEC은 DNS 쿼리 응답이 인증되지 않은 경우, 그 응답을 무효화함으로써 스푸핑 공격을 막는 데 효과적. DNS 서버에서 DNSSEC을 사용하면 클라이언트는 응답이 신뢰할 수 있는지 확인할 수 있음.

**DNSSEC 활성화(Default)**

```
options {
    dnssec-enable yes;
    dnssec-validation yes;
};
```

### DNS 캐시 중독 (DNS Cache Poisoning) 방지

캐시 중독은 공격자가 잘못된 데이터를 DNS 서버의 캐시에 저장하여, 그 데이터를 클라이언트에게 반환하도록 만드는 공격이다. 재귀적인 DNS 서버에서 문제가 될 수 있다.

**무작위 포트 및 ID 사용(DNSSEC만 활성화 해도 충분)**

쿼리의 소스 포트와 트랜잭션 ID를 무작위로 사용하여 예측 불가능하게 만듦으로써 캐시 중독 공격을 어렵게한다.

```
options {
    query-source address * port *;
};
```

### DDoS 공격 (DNS Amplification) 방지

DNS 증폭 공격은 DNS 서버를 이용해 공격 대상에게 대량의 트래픽을 전송하는 DDoS 공격의 일종이다.

**Rate Limiting (RRL) 적용(BIND 9.9.4 이상에서 기본적으로 지원)**

rate-limit 옵션 추가

```
options {
    rate-limit {
        responses-per-second 10;        # 초당 응답 제한 (기본값은 5)
        window 5;                       # RRL 윈도우 크기 (초 단위)
        slip 2;                         # 1/x 확률로 응답을 전송함 (2 = 50%)
        qps-scale 250;                  # 응답 제한을 조정할 클라이언트 수 (기본값은 1000)
        ipv4-prefix-length 24;          # IPv4 네트워크 그룹화 범위 (/24 기본값)
        ipv6-prefix-length 56;          # IPv6 네트워크 그룹화 범위 (/56 기본값)
        exempt-clients { localhost; };  # RRL 제한에서 제외할 클라이언트
    };
};
```

- responses-per-second : 한 클라이언트 IP에 대해 초당 허용되는 응답 수. 초과하는 경우 응답을 제한한다. 기본값은 5이며, 이를 10으로 설정한다.
- window : 쿼리를 계산할 시간 창을 설정한다. 5초 동안 응답을 계산하는 시간 창을 설정한다.
- slip : RRL이 활성화된 경우, 몇 개의 쿼리 응답을 드롭하고 몇 개를 허용할지 설정한다. slip 2는 50% 확률로 응답을 전송하겠다는 뜻이다.
- qps-scale : 응답 제한을 조정할 클라이언트의 수를 설정한다.
- ipv4-prefix-length 및 ipv6-prefix-length : 네트워크 그룹화에 사용할 네트워크 길이를 설정한다.
- exempt-clients : RRL 제한에서 제외할 클라이언트를 설정한다.

### BIND 9 서비스 재시작 및 부팅 시 자동 실행 설정

```bash
sudo systemctl restart named
sudo systemctl enable named
```

### 해당 인스턴스 방화벽 규칙에 DNS(53 / TCP, UDP) 추가

![](/uploads/network-bind-9-dns-server-seolci/image-11.png)

### BIND 9 서버가 제대로 설정되었는지 확인

![](/uploads/network-bind-9-dns-server-seolci/image-12.png)

## 클라이언트에서 테스트

Windows

```sh
nslookup example.com <BIND 9 서버의 IP 주소>
```

![](/uploads/network-bind-9-dns-server-seolci/image-13.png)

Linux

```bash
dig @<BIND 9 서버의 IP 주소> example.com
```

![](/uploads/network-bind-9-dns-server-seolci/image-14.png)

![](/uploads/network-bind-9-dns-server-seolci/image-15.png)

*DNS 요청, 응답 패킷 확인*

### 테스트 결과 정상이라면 DNS 서버 변경

**Linux에서 DNS 서버 설정 변경**

/etc/resolv.conf 파일을 편집하여 BIND 9 서버의 IP 주소를 지정

```bash
sudo vim /etc/resolv.conf
```

파일에 다음을 추가

```
nameserver <BIND 9 서버의 IP 주소>
```
