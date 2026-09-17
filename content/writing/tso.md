---
title: "TSO (TCP Segmentation Offload)"
date: 2025-12-07
tags: []
---

# A. Summary

현대의 고성능 네트워크 환경(1Gbps ~ 100Gbps) 에서 CPU의 처리 속도는 네트워크 대역폭을 따라가기 벅찬 경우가 많다. **TSO (TCP Segmentation Offload)**와 **LSO(Large Send Offload)** 는 이러한 병목 현상을 해결하기 위해, CPU가 담당하던 패킷 처리 부하를 네트워크 인터페이스 카드(NIC)로 이관(Offload)하는 핵심 기술이다.

## B. 기술적 배경: MTU의 제약과 CPU의 부하

### B.1. MTU (Maximum Transmission Unit) 의 한계

이더넷(Ethernet) 환경의 표준 전송 단위인 MTU는 기본적으로 1,500 Byte로 제한된다. 아무리 거대한 데이터(Ex. 4GB 파일) 를 전송하더라도, 실제 물리 계층(Physical Layer) 을 통과할 때는 반드시 1,500 Byte 크기의 작은 패킷으로 쪼개져야 한다.

### B.2. 레거시(Legacy) 방식의 문제점

TSO/LSO 기술이 적용되지 않은 환경에서는 이 "쪼개는 작업(Segmentation)" 을 운영체제의 커널(CPU) 이 직접 수행했다.

- 오버헤드 발생: 64KB 데이터를 전송하려면 CPU는 약 44번의 분할 작업, 헤더 생성, 체크섬(Checksum) 계산을 수행해야 한다.
- 인터럽트 폭증: 각 패킷을 전송할 때마다 CPU와 NIC 간의 통신(Interrupt) 이 발생하여 시스템 전체 성능 저하를 유발한다.

## C. 상세 작동 원리 (Mechanism)

TSO/LSO는 **도매(Wholesale) 와 소매(Retail)** 의 원리로 작동한다. CPU는 데이터를 큼직한 덩어리(도매)로 넘기고, NIC가 이를 잘게 나누어(소매) 전송한다.

### C.1. 프로세스 비교

| 구분 | Non-offload (CPU 처리) | Offload Enabled (TSO/LSO) |
| --- | --- | --- |
| 데이터 전달 | CPU가 1,500 Byte씩 잘라서 44번 NIC에 전달 | CPU가 64KB 통데이터를 단 1번 NIC에 전달 |
| 헤더 / 체크섬 | CPU가 44회 직접 연산 및 부착 | NIC 칩셋이 하드웨어적으로 고속 연산 및 부착 |
| 시스템 부하 | CPU 사용률 급증, 버스 대역폭 낭비 | CPU Idle 상태 유지, 효율적 대역폭 사용 |

### C.2. 데이터 흐름도

1. Application: 대용량 버퍼 생성
2. TCP/IP Stack (OS): 데이터를 쪼개지 않고, 거대한 패킷(Super-packet) 상태로 NIC 드라이버에 전달
3. NIC (Hardware): DMA(Direct Memory Access) 를 통해 데이터를 읽어 들인 후, 내부 로직을 통해 MTU 사이즈에 맞춰 고속으로 분할(Segmentation) 하여 전선(Wire) 으로 송출

## D. 용어의 기술적 구분 (Terminology)

- TSO (TCP Segmentation Offload)
  - 주로 Linux/Unix 진영에서 사용하는 용어
  - 명칭 그대로 TCP 프로토콜 의 패킷 분할을 오프로딩하는 것에 특화
- LSO (Large Send Offload)
  - 주로 Windows/Microsoft 진영 및 하드웨어 벤더에서 사용하는 용어
  - TSO와 동일한 개념이나, TCP 외의 프로토콜까지 포함하는 더 포괄적인 의미로 쓰이기도 한다. (LSO V1, V2 등으로 버전이 나뉨)
- GSO (Generic Segmentation Offload)
  - 소프트웨어적 대안 기술. NIC가 하드웨어적으로 TSO를 지원하지 않거나 불안정할 때 사용
  - 패킷 분할을 NIC 전달 직전 까지 최대한 미루어(Deferred Segmentation), 커널 네트워크 스택 내에서의 순회 비용을 줄이는 기술

## E. 장단점

### E.1. Pros

1. Throughput(처리량) 향상: CPU 병목이 사라져 10Gbps 이상의 고대역폭을 온전히 활용 가능
2. CPU 효율성 증대: 절약된 CPU 자원을 애플리케이션 처리에 할당 가능

### E.2. Cons

1. 패킷 캡처의 혼란
  1. tcpdump 나 wireshark 로 패킷을 캡처하면 1,500 Byte보다 훨씬 큰(Ex. 64KB) 비정상적인 패킷이 잡힌다. 이는 캡처 시점이 NIC 처리 이전 이기 때문이며, 실제 네트워크 장애로 오인하기 쉽다.
2. 마이크로 버스트(Micro-burst) 및 지연
  1. NIC가 거대한 데이터를 한 번에 처리하려다 보니, 순간적으로 트래픽이 폭주(Burst) 하여 버퍼가 꽉 차는 현상이 발생할 수 있다. 민감한 실시간 통신(VoIP, 금융 트레이딩) 에서는 오히려 미세한 지연(Latency) 을 유발하기도 한다.
3. 하드웨어 버그 및 호환성
  1. 일부 NIC 칩셋의 경우, TSO 처리 로직의 결함으로 인해 DMA Hang(시스템 멈춤) 이나 데이터 커럽션(Corruption) 이 발생할 수 있다. 이 경우 TSO를 비활성화하는 것이 표준 대응 절차다.
