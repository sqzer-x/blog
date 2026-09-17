---
title: "How to using  sysmon for Linux"
date: 2025-12-07
tags: []
---

# Summary

Sysmon for Linux는 마이크로소프트 Sysinternals 도구 중 하나인 시스템 모니터(System monitor) 를 리눅스 환경으로 포팅한 강력한 보안 모니터링 도구이다.

윈도우 환경에서 침해 사고 분석과 위협 탐지의 표준처럼 쓰이던 Sysmon을 리눅스에서도 사용할 수 있다.

## A. 핵심 원리: eBPF (Extended Berkeley Packet Filter)

Sysmon for Linux가 기존의 리눅스 감사 도구(auditd 등) 와 가장 차별화되는 점은 **eBPF**를 사용한다는 것이다.

- 동작 방식 : 커널 소스 코드를 수정하거나 모듈을 로드하지 않고도, 커널 내부의 특정 이벤트(시스템 호출, 네트워크 패킷 등) 를 안전하고 효율적으로 후킹(Hooking) 하여 모니터링한다.
- 장점 : 시스템 안정성을 해치지 않으면서 고성능으로 데이터를 수집할 수 있다. (과거 커널 모듈 방식의 시스템 충돌 위험을 최소화함)

## B. 주요 기능 및 모니터링 항목

Sysmon은 윈도우 버전과 거의 동일한 이벤트 ID 체계를 사용하므로, 윈도우와 리눅스가 섞인 혼합 환경에서 통합 관제(SIEM) 를 구축하기 매우 유리하다.

주요 이벤트 ID는 다음과 같다.

- Event ID 1 (Process Creation) : 어떤 프로세스가 실행되었는지, 부모 프로세스는 무엇인지, 실행 시 명령어 인자(Command Line)는 무엇인지 기록한다. (가장 중요)
- Event ID 3 (Network Connection) : 프로세스가 외부와 통신할 때 IP, 포트, 프로토콜 정보를 기록한다.
- Event ID 5 (Process Terminate) : 프로세스가 언제 종료되었는지 기록한다.
- Event ID 9 (RawAccessRead) : 드라이브 섹터에 대한 직접 읽기를 탐지한다.
- Event ID 11 (FileCreate) : 파일이 생성되거나 덮어써질 때를 기록한다. (랜섬웨어 탐지 등에 유용)

## C. 로그 저장 위치

윈도우에서는 '이벤트 뷰어'에 저장되지만, 리눅스에서는 표준 로깅 시스템을 따른다.

- Syslog : /var/log/syslog (또는 /var/log/messages)
- Journald : journalctl 명령어로 조회 가능
- 로그 포맷은 XML 형태를 텍스트로 변환하여 저장하므로, Splunk나 ELK 같은 SIEM 도구로 전송하여 파싱하기좋다.

## D. 기존 리눅스 도구(Auditd)와의 비교

| 특성 | Sysmon for Linux | Auditd (Linux Audit Framework) |
| --- | --- | --- |
| 기반 기술 | eBPF (최신, 고성능) | Kernel Audit Subsystem (전통적) |
| 로그 가독성 | 높음 (구조화된 데이터, 관계 파악 용이) | 낮음 (해석이 어렵고 파싱이 까다로움) |
| 필터링 | 강력함 (XML 기반의 상세 조건 설정) | 가능하지만 규칙 작성이 복잡함 |
| 플랫폼 통합 | Windows/Linux 로그 포맷 통일 가능 | 리눅스 전용 |
| 상태 | 실행 프로세스 트리 추적 용이 | 단일 이벤트 위주 |

## E. 설치

### E.1. 마이크로소프트 저장소 키 및 패키지 등록

```bash
# 1. 설치 파일 다운로드
$ wget -q https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb -O packages-microsoft-prod.deb

# 2. 다운로드한 패키지 설치 (저장소 등록)
$ sudo dpkg -i packages-microsoft-prod.deb
```

### E.2. Sysmon 설치

```bash
# 1. 패키지 목록 업데이트
$ sudo apt-get update

# 2. Sysmon for Linux 설치
$ sudo apt-get install sysmonforlinux
```

## F. 설정 파일 생성

설정파일(XML) 을 지정하고 서비스를 시작해야 Sysmon 이 동작 한다.

#### sysmon-config.xml

```xml
<Sysmon schemaversion="4.81">
  <HashAlgorithms>sha256</HashAlgorithms>
  
  <EventFiltering>
    
    <RuleGroup name="Terminate_Silence" groupRelation="or">
      <ProcessTerminate onmatch="include">
        <Image condition="is">THIS_PROCESS_WILL_NEVER_EXIST_12345</Image>
      </ProcessTerminate>
    </RuleGroup>

    <RuleGroup name="ProcessCreate_Security" groupRelation="or">
      
      <ProcessCreate onmatch="exclude">
        <Image condition="end with">gnome-shell</Image>       <Image condition="end with">tracker-miner-fs-3</Image> <Image condition="end with">vmtoolsd</Image>           <Image condition="is">&lt;unknown process&gt;</Image>  <CommandLine condition="contains">tmux-continuum</CommandLine>      <CommandLine condition="contains">continuum_save.sh</CommandLine>   <CommandLine condition="contains">check_tmux_version.sh</CommandLine> <CommandLine condition="contains">cpuUsage.sh</CommandLine>    <CommandLine condition="contains">extensionHost</CommandLine>  <CommandLine condition="contains">which ps</CommandLine>       <CommandLine condition="contains">/usr/bin/ps</CommandLine>    </ProcessCreate>
      
      <ProcessCreate onmatch="include">
        <Image condition="end with">bash</Image>
        <Image condition="end with">sh</Image>
        <Image condition="end with">dash</Image>
        <Image condition="end with">zsh</Image>
        
        <Image condition="end with">sudo</Image>
        <Image condition="end with">su</Image>
        
        <Image condition="end with">python3</Image>
        <Image condition="end with">perl</Image>
        <Image condition="end with">gcc</Image>
        <Image condition="end with">g++</Image>
        
        <Image condition="end with">curl</Image>
        <Image condition="end with">wget</Image>
        <Image condition="end with">nc</Image>   <Image condition="end with">ncat</Image>
        <Image condition="end with">ssh</Image>  <Image condition="end with">scp</Image>  <Image condition="end with">ftp</Image>
        <Image condition="end with">socat</Image>
      </ProcessCreate>
    </RuleGroup>

    <RuleGroup name="Network_Security" groupRelation="or">
      <NetworkConnect onmatch="include">
        <Image condition="end with">curl</Image>
        <Image condition="end with">wget</Image>
        <Image condition="end with">nc</Image>
        
        <Image condition="end with">bash</Image>
        <Image condition="end with">sh</Image>
        
        <Image condition="end with">python3</Image>
        
        <Image condition="end with">ssh</Image>
      </NetworkConnect>
    </RuleGroup>

  </EventFiltering>
</Sysmon>
```

## G. 설정 적용

### G.1 만든 파일을 로드하여 Sysmon을 시작 or 재시작

```bash
$ sudo sysmon -i sysmon-config.xml
```

### G.2 이미 실행 중이라면 설정을 업데이트(-c)

```bash
$ sudo sysmon -c sysmon-config.xml
```

## H. 로그 확인하기

```bash
# Ubuntu의 기본 시스템 로그 파일 모니터링
$ sudo tail -f /var/log/syslog | grep "Linux-Sysmon"
```

### H.1 가독성이 떨어지는 로그

```bash
2025-12-10T22:27:58.152234+09:00 x sysmon: <Event><System><Provider Name="Linux-Sysmon" Guid="{ff032593-a8d3-4f13-b0d6-01fc615a0f97}"/><EventID>1</EventID><Version>5</Version><Level>4</Level><Task>1</Task><Opcode>0</Opcode><Keywords>0x8000000000000000</Keywords><TimeCreated SystemTime="2025-12-10T13:27:58.151790000Z"/><EventRecordID>16525</EventRecordID><Correlation/><Execution ProcessID="1296720" ThreadID="1296720"/><Channel>Linux-Sysmon/Operational</Channel><Computer>x</Computer><Security UserId="0"/></System><EventData><Data Name="RuleName">ProcessCreate_Security</Data><Data Name="UtcTime">2025-12-02 06:14:11.408</Data><Data Name="ProcessGuid">{3e748dcd-83b3-692e-d10b-c636f7560000}</Data><Data Name="ProcessId">1979575</Data><Data Name="Image">/usr/bin/sudo</Data><Data Name="FileVersion">-</Data><Data Name="Description">-</Data><Data Name="Product">-</Data><Data Name="Company">-</Data><Data Name="OriginalFileName">-</Data><Data Name="CommandLine">sudo tail -f /var/log/syslog</Data><Data Name="CurrentDirectory">/home/devastator/.config</Data><Data Name="User">devastator</Data><Data Name="LogonGuid">{3e748dcd-65f1-6934-e803-000002000000}</Data><Data Name="LogonId">1000</Data><Data Name="TerminalSessionId">3</Data><Data Name="IntegrityLevel">no level</Data><Data Name="Hashes">SHA256=654d953098b5dd26fcc3af44d4cf6e986f61f84ad9198d57722702c6034bd686</Data><Data Name="ParentProcessGuid">{3e748dcd-7503-692e-9553-b55339630000}</Data><Data Name="ParentProcessId">1907076</Data><Data Name="ParentImage">/usr/bin/zsh</Data><Data Name="ParentCommandLine">zsh</Data><Data Name="ParentUser">devastator</Data></EventData></Event>
2025-12-10T22:28:07.111277+09:00 x sysmon: <Event><System><Provider Name="Linux-Sysmon" Guid="{ff032593-a8d3-4f13-b0d6-01fc615a0f97}"/><EventID>1</EventID><Version>5</Version><Level>4</Level><Task>1</Task><Opcode>0</Opcode><Keywords>0x8000000000000000</Keywords><TimeCreated SystemTime="2025-12-10T13:28:07.110532000Z"/><EventRecordID>16526</EventRecordID><Correlation/><Execution ProcessID="1296720" ThreadID="1296720"/><Channel>Linux-Sysmon/Operational</Channel><Computer>x</Computer><Security UserId="0"/></System><EventData><Data Name="RuleName">ProcessCreate_Security</Data><Data Name="UtcTime">2025-12-02 06:14:20.366</Data><Data Name="ProcessGuid">{3e748dcd-83bc-692e-d15b-68e08b590000}</Data><Data Name="ProcessId">1979719</Data><Data Name="Image">/usr/bin/sudo</Data><Data Name="FileVersion">-</Data><Data Name="Description">-</Data><Data Name="Product">-</Data><Data Name="Company">-</Data><Data Name="OriginalFileName">-</Data><Data Name="CommandLine">sudo</Data><Data Name="CurrentDirectory">/home/devastator/.config</Data><Data Name="User">devastator</Data><Data Name="LogonGuid">{3e748dcd-62c8-6934-e803-000001000000}</Data><Data Name="LogonId">1000</Data><Data Name="TerminalSessionId">3</Data><Data Name="IntegrityLevel">no level</Data><Data Name="Hashes">SHA256=654d953098b5dd26fcc3af44d4cf6e986f61f84ad9198d57722702c6034bd686</Data><Data Name="ParentProcessGuid">{00000000-0000-0000-0000-000000000000}</Data><Data Name="ParentProcessId">1237687</Data><Data Name="ParentImage">-</Data><Data Name="ParentCommandLine">-</Data><Data Name="ParentUser">-</Data></EventData></Event>
```

하지만 XML 형식의 로그가 쏟아져 나와 가독성이 매우 떨어지므로 무분별한 로그를 정제하기 위해 Python 뷰어 스크립트가 필요하다

## I. 뷰어 스크립트 생성

### sysmon_view.py

```python
import sys
import xml.etree.ElementTree as ET

# ==============================================================================
# [스크립트 설명]
# Sysmon for Linux가 생성하는 XML 형식의 로그를 실시간으로 파싱
# 'tail -f /var/log/syslog' 명령어와 파이프(|)로 연결되어 실행
#
# [주요 기능]
# 1. 복잡한 XML 태그 제거 및 데이터 추출
# 2. 불필요한 노이즈(Event ID 5 등) 필터링
# 3. 중요 이벤트(프로세스 생성, 네트워크 연결) 컬러 강조
# 4. 파일 해시(SHA256) 값 출력 지원
# ==============================================================================

def get_tag_name(elem):
    """
    XML 태그에서 네임스페이스(Namespace) URL을 제거하고, 순수 태그 이름만 추출하는 함수
    
    [예시]
    입력: {http://schemas.microsoft.com/schemas/eventlog/main}EventID
    출력: EventID
    
    이유: Sysmon 로그는 표준 포맷을 따르기 때문에 태그 앞에 긴 URL이 붙어있어,
          이를 제거해야 데이터 처리가 쉬움
    """
    if '}' in elem.tag:
        # '}' 문자를 기준으로 쪼개서 뒷부분(진짜 이름)만 가져옴
        return elem.tag.split('}', 1)[1]
    return elem.tag

def parse_and_print():
    """
    표준 입력(stdin)으로 들어오는 로그를 한 줄씩 읽어서 분석하고 출력하는 메인 함수
    """
    
    # 1. 시작 배너 출력 (스크립트가 실행되었음을 알림)
    print("\n" + "="*70)
    print("   🛡️  Sysmon Log Viewer (Detailed Comment Version)")
    print("   waiting for security events... (Noise filtered)")
    print("="*70 + "\n")
    
    # 2. 실시간 로그 읽기 루프 (파이프로 연결된 데이터가 들어올 때마다 반복)
    for line in sys.stdin:
        try:
            # Sysmon 로그인지 확인 (로그 라인에 <Event> 태그가 있는지 검색)
            start_idx = line.find('<Event>')
            
            # <Event> 태그가 없으면 Sysmon 로그가 아니거나 빈 줄이므로 건너뜀
            if start_idx == -1:
                continue
            
            # XML 데이터 부분만 잘라냄
            xml_data = line[start_idx:]
            
            # 3. XML 파싱 (문자열을 구조화된 데이터로 변환)
            try:
                root = ET.fromstring(xml_data)
            except ET.ParseError:
                # XML 형식이 깨져있으면 무시하고 다음 줄로 넘어감
                continue

            # 데이터를 저장할 변수 초기화
            event_id = "Unknown"
            data_map = {} # <Data Name="Key">Value</Data> 형태를 저장할 딕셔너리

            # 4. XML 내부 순회 및 데이터 추출
            for elem in root.iter():
                tag = get_tag_name(elem) # 태그 이름 정제
                
                # 이벤트 ID 추출 (<EventID>1</EventID>)
                if tag == 'EventID':
                    event_id = elem.text
                
                # 상세 데이터 추출 (<Data Name="Image">/usr/bin/sudo</Data>)
                elif tag == 'Data':
                    name_attr = elem.attrib.get('Name') # Name 속성 값 가져오기 (예: Image, User)
                    if name_attr:
                        # 텍스트가 있으면 가져오고, 없으면 빈 문자열 저장
                        data_map[name_attr] = elem.text if elem.text else ""

            # 5. 필터링
            # Event ID 5 (Process Terminate)는 노이즈가 되므로 출력하지 않음
            if event_id == "5":
                continue 

            # 6. 출력에 사용할 공통 필드 가져오기 (없으면 기본값 사용)
            time = data_map.get('UtcTime', 'Unknown Time')     # 발생 시간
            image = data_map.get('Image', 'Unknown Process')   # 실행된 프로세스 경로
            user = data_map.get('User', '-')                   # 실행한 사용자

            # 7. ANSI 색상 코드 정의 (터미널에서 색을 입히기 위함)
            RESET = "\033[0m"   # 색상 초기화
            GREEN = "\033[92m"  # 초록색 (프로세스 생성)
            RED = "\033[91m"    # 빨간색 (네트워크 연결 - 위험)
            BLUE = "\033[94m"   # 파란색 (파일 생성)
            GRAY = "\033[90m"   # 회색 (부가 정보/해시)
            BOLD = "\033[1m"    # 굵게 강조

            # 8. 이벤트 ID별 출력 포맷 설정
            
            # [CASE 1] Event ID 1: 프로세스 생성
            if event_id == "1":
                cmd = data_map.get('CommandLine', '') # 실행된 명령어 전체
                hashes = data_map.get('Hashes', '')   # SHA256 등 해시값
                
                # 메인 정보 출력
                print(f"{GREEN}[CREATE]{RESET} {time} | {BOLD}{image}{RESET} | User: {user} | {cmd}")
                
                # 해시값이 존재하면, 바로 아랫줄에 회색으로 들여쓰기하여 출력
                if hashes:
                    print(f"         └─ {GRAY}Hash: {hashes}{RESET}")

            # [CASE 2] Event ID 3: 네트워크 연결 (외부 통신)
            elif event_id == "3":
                dest_ip = data_map.get('DestinationIp', '-')     # 목적지 IP
                dest_port = data_map.get('DestinationPort', '-') # 목적지 포트
                protocol = data_map.get('Protocol', 'tcp')       # 프로토콜 (tcp/udp)
                
                print(f"{RED}[NET]{RESET}    {time} | {image} -> {dest_ip}:{dest_port} ({protocol})")
            
            # [CASE 3] Event ID 11: 파일 생성 (악성코드 드롭 등)
            elif event_id == "11":
                target = data_map.get('TargetFilename', '-') # 생성된 파일 경로
                
                print(f"{BLUE}[FILE]{RESET}   {time} | {image} created -> {target}")
            
            # [CASE 4] 그 외 이벤트 (설정 변경 등)
            else:
                print(f"[ID {event_id}] {time} | {image}")

        except Exception as e:
            # 실행 중 예상치 못한 에러가 발생해도 스크립트가 꺼지지 않게 처리
            # (디버깅이 필요할 땐 아래 pass를 print(e)로 바꾸면 됨)
            pass

# 스크립트가 직접 실행될 때만 parse_and_print() 함수 실행
if __name__ == "__main__":
    parse_and_print()
```

## J. 뷰어 스크립트 실행

```bash
$ sudo tail -f /var/log/syslog | python3 -u sysmon_view.py
```

#### 결과값 예시

```bash
======================================================================
   🛡️   Sysmon Log Viewer (Detailed Comment Version)
   waiting for security events... (Noise filtered)
======================================================================

[CREATE] 2025-12-02 05:03:30.832 | /usr/bin/sudo | User: devastator | sudo tail -f /var/log/syslog
         └─ Hash: SHA256=654d953098b5dd26fcc3af44d4cf6e986f61f84ad9198d57722702c6034bd686
[CREATE] 2025-12-02 05:03:39.391 | /usr/bin/ssh | User: devastator | ssh
         └─ Hash: SHA256=ffc312252dd2756e3346f1fd5a680486a4073abef452d44939351742d9b4bba0
[CREATE] 2025-12-02 05:03:42.230 | /usr/bin/curl | User: devastator | curl google.com
         └─ Hash: SHA256=aca992dba6da014cd5baaa739624e68362c8930337f3a547114afdbd708d06a4
[NET]    2025-12-02 05:03:42.271 | /usr/bin/curl -> 127.0.0.1:36697 (udp)
[NET]    2025-12-02 05:03:42.306 | /usr/bin/curl -> 142.250.206.206:80 (tcp)
```

![](/uploads/etc-systemd-sysmon-sayonggi-for-linux/image-1.png)

Python 뷰어 스크립트를 통해 출력된 결과값은 필요한 정보만 확인할 수 있어 매우 가독성을 높혀준다.

Ubuntu 24.04 에서 각각의 명령어의 Hash(SHA256) 값을 확인 할 수 있다.

#### ssh

- SHA256=ffc312252dd2756e3346f1fd5a680486a4073abef452d44939351742d9b4bba0

#### curl

- SHA256=aca992dba6da014cd5baaa739624e68362c8930337f3a547114afdbd708d06a4

#### wget

- SHA256=b8f8a975cf3e7908e076de79814aa448c6086aacfc08165be04ce65665e08e39

### References

[1] [https://github.com/microsoft/SysmonForLinux.git](https://github.com/microsoft/SysmonForLinux.git?ref=openpesto.com)
