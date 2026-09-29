---
name: mobile-bypass
description: "Use this skill for mobile app penetration testing bypass workflows — SSL/certificate pinning bypass, root detection bypass, Frida/anti-debugging detection bypass, emulator detection bypass, integrity/tamper check bypass, and commercial app-shield/multi-layer protection bypass (e.g. Korean financial or public-sector apps using vendor SDKs like INKA, Liapp, NPCore, AppSealing) on Android (and iOS where noted). Trigger whenever the user connects a mobile device for analysis, mentions bypassing app security logic, mentions Frida hooking, mentions an app detecting root/frida/tampering/emulator, mentions testing a banking or financial app, or wants to move from static analysis of a mobile app into dynamic bypass testing. Also trigger for the iterative loop of analyze environment, identify security logic, write bypass script, attempt, diagnose failure, retry until bypass succeeds. Assumes Claude Code with local adb/frida/jadx/ghidra CLI access."
---

# Mobile Bypass Workflow

모바일 앱 보안로직(SSL Pinning, 루팅탐지, Frida탐지, 무결성검사) 우회를 위한 반복 루프 스킬.
전체 루프: **환경분석 → 로직식별 → 스크립트작성 → 시도 → 실패시진단 → 재시도(성공까지)**

이 스킬은 Claude Code(로컬 CLI, adb/frida 직접 실행 가능)를 전제로 함. Claude.ai 웹챗에서 쓰는 경우는 맨 아래 "웹챗 환경" 섹션 참고.

## 진입 조건 / 언제 이 스킬을 씀

- 사용자가 "폰 연결했다", "단말기 붙였다" 등 디바이스 준비 완료를 알릴 때
- 특정 앱의 SSL Pinning, 루팅탐지, Frida탐지, 무결성검사(서명검증, 앱 위변조 탐지) 우회 요청
- 이미 정적분석(jadx 등)으로 앱을 열어본 상태에서 "이제 우회해보자"로 넘어갈 때

## 0단계: 사전 확인 (매번 최초 1회)

```bash
adb devices                          # 디바이스 연결 확인
adb shell getprop ro.build.version.release   # Android 버전
adb shell getprop ro.product.cpu.abi         # 아키텍처 (arm64-v8a 등 - frida-server 바이너리 선택에 필요)
adb shell su -c id 2>/dev/null       # 루팅 여부 확인
frida-ps -U 2>/dev/null              # frida-server 연결 확인 (안 되면 push+실행 필요)
```

frida-server가 안 떠 있으면:
```bash
adb push frida-server-<version>-android-<abi> /data/local/tmp/frida-server
adb shell "chmod 755 /data/local/tmp/frida-server"
adb shell "/data/local/tmp/frida-server &"
```
frida 버전은 로컬 `frida --version`과 반드시 일치해야 함 (버전 불일치가 가장 흔한 실패 원인 — `references/failure-diagnosis.md` 참고).

**금융앱/공공앱처럼 다층방어(상용 앱쉴드)가 예상되는 대상이면, 1단계 진입 전에 `references/env-hardening.md` 체크리스트부터 전부 통과할 것.** 나중에 문제 생기면 그때 대응하는 것보다, 시작 전에 Magisk/Frida 흔적을 미리 지워두는 게 이후 루프 반복을 크게 줄임.

## 1단계: 앱 환경 분석

대상 패키지 확인 후 APK 추출, 프레임워크 판별:

```bash
adb shell pm list packages | grep -i <키워드>
adb shell pm path <package.name>
adb pull <apk경로> ./target.apk
jadx -d ./decompiled ./target.apk
```

프레임워크 판별 기준은 `references/env-triage.md` 참고 (Native/Flutter/React Native 구분에 따라 이후 전략이 완전히 달라짐).

## 2단계: 보안로직 식별 (정적분석)

`decompiled/` 내에서 아래 패턴으로 grep, 어떤 종류의 방어로직인지 식별:

```bash
# SSL Pinning 후보
grep -rl "CertificatePinner\|X509TrustManager\|checkServerTrusted\|SSLContext" decompiled/

# 루팅탐지 후보
grep -rli "rootbeer\|isRooted\|test-keys\|/system/app/Superuser\|su binary\|SafetyNet" decompiled/

# Frida/디버깅탐지 후보
grep -rli "frida\|ptrace\|TracerPid\|/proc/self/maps\|gum-js-loop" decompiled/

# 무결성/서명검증 후보
grep -rli "PackageManager.GET_SIGNATURES\|signingInfo\|checkSignature\|Debug.isDebuggerConnected" decompiled/

# 에뮬레이터 탐지 후보
grep -rli "build.fingerprint\|goldfish\|ranchu\|genymotion\|qemu" decompiled/

# 상용 앱쉴드 벤더 후보 (아래 하나라도 걸리면 개별 카테고리보다 commercial-shield.md 먼저 볼 것)
grep -rli "inca\|niap\|appsuit\|nprotect\|liapp\|npcore\|appsealing\|seworks" decompiled/
```

매칭된 클래스는 `references/security-logic/`의 해당 문서에서 구현 패턴별 우회 방식 확인. **이 단계에서 아래 판정까지 끝내고 3단계로 넘어갈 것** (3단계에서 다시 고민하지 않도록):

- **표준 라이브러리 시그니처 정확히 일치** (`okhttp3.CertificatePinner`, `com.scottyab.rootbeer.RootBeer` 등 패키지명/클래스명이 알려진 그대로) → "표준 케이스"로 분류
- **이름은 비슷하나 커스텀 구현, 난독화로 시그니처 불명확, 여러 로직이 얽혀있음** → "커스텀 케이스"로 분류
- **벤더 시그니처(INKA/Liapp/NPCore/SEWORKS 등) 검출됨** → 개별 카테고리 무시하고 `commercial-shield.md`를 먼저 읽을 것. 다층방어가 SDK 내부에 캡슐화되어 있어 개별 대응이 무의미한 경우가 많음
- `ssl-pinning.md` / `root-detection.md` / `anti-frida.md` / `integrity-check.md` / `emulator-detection.md` / `commercial-shield.md`

**grep에서 아무것도 안 나오는데 방어동작은 확인되는 경우, 또는 1단계에서 Flutter로 판별된 경우** → Java 레벨엔 로직이 없고 네이티브(.so)에 구현된 것. `references/native-lib-analysis.md`로 분기 (Ghidra 기반 리버싱 + 오프셋 훅 워크플로우). Flutter 앱은 거의 항상 이 경로를 타게 됨.

## 3단계: 우회 스크립트 작성

2단계 판정 결과에 따라 바로 분기 — 시도해보고 안 되면 전환하는 게 아니라 판정 시점에 경로 확정:

**표준 케이스** → `scripts/bypass-templates/`의 해당 템플릿을 그대로 사용, 클래스명이 정확히 일치하면 수정 없이 바로 실행. 오버로드 시그니처만 실제 코드와 대조해서 확인 (파라미터 타입이 버전마다 다를 수 있음).

**커스텀 케이스 / 네이티브 케이스** → 템플릿을 베이스로 끼워맞추려 하지 말 것. 2단계에서 확인한 실제 jadx 코드(또는 native-lib-analysis.md에서 나온 Ghidra 디컴파일 결과)를 직접 읽고, 그 클래스/메서드 구조에 맞게 Frida 스크립트를 처음부터 작성. 템플릿은 Frida API 문법 참고용 정도로만 사용 (`Java.use()`, `Interceptor.attach()` 패턴 확인 용도).

```bash
frida -U -f <package.name> -l custom-bypass.js --no-pause
```

**훅 순서/타이밍 원칙 (다층방어 대상일수록 중요)**:
- anti-frida 우회를 항상 최우선으로 걸 것 (이게 먼저 걸리면 이후 훅 기회 자체가 없음)
- 벤더 SDK(`commercial-shield.md` 대상)는 `Application.onCreate()` 직후 초기화되는 경우가 대부분 → 반드시 `-f` spawn 방식 사용, 이미 실행 중인 프로세스에 `-p`로 뒤늦게 attach하면 이미 방어체계가 셋업 완료된 상태라 우회 불가능한 경우가 많음
- 방어로직이 여러 개 동시에 걸려있으면(SSL+루팅+무결성 등) 스크립트 하나로 합쳐서 spawn 시점에 한 번에 전부 훅 — **단, 같은 Java 메서드를 여러 모듈이 각자 override하면 충돌남 (마지막 것만 살아남고 앞은 조용히 무효화됨). 병합 전 `references/hook-merging.md` 확인 필수**

## 4단계: 시도 및 결과 확인

실행 로그에서 확인할 것:
- 훅이 실제로 걸렸는지 (`[+] Hooked ...` 등 자체 로그 출력 필수로 스크립트에 넣기)
- 앱이 크래시했는지 (크래시=탐지 로직이 훅을 감지하고 강제종료했을 가능성)
- 목표 동작 성공 여부 (Burp에서 트래픽 보이는지, 루팅 경고 안 뜨는지 등)

## 5단계: 실패 시 진단 → 재시도

실패했다고 포기하지 말고 `references/failure-diagnosis.md` 체크리스트로 원인 분류부터:

1. **훅이 안 걸림** → 클래스명/메서드 시그니처 틀림 (난독화 재확인, jadx에서 실제 시그니처 재추출)
2. **훅은 걸렸는데 무력화 안 됨** → 다른 위치에서 이중 체크 중 (native/so 레벨 체크 병행 의심 → `frida-trace`로 전체 콜스택 추적)
3. **앱이 훅 시점에 크래시** → 타이밍 문제, `-f` early attach 대신 spawn 후 지연 attach 시도, 혹은 anti-frida가 먼저 실행됨
4. **네이티브 레벨(.so) 체크** → jadx로 안 보임, `frida-trace -i "*"` 로 네이티브 함수 호출 추적하거나 IDA/Ghidra 필요 (범위 넘어가면 사용자에게 알림)

원인 파악되면 스크립트 수정 후 3단계로 복귀. 이 루프를 성공할 때까지 반복하되, 매 시도마다 **무엇을 바꿨고 왜 그런지** 사용자에게 짧게 보고 (블랙박스로 계속 찍어보지 않기).

## 웹챗 환경 (Claude.ai, 로컬 adb 접근 불가)

이 경우 루프의 3~4단계를 사용자가 직접 실행해야 함:
- Claude는 스크립트까지만 작성해서 제공
- 사용자가 로컬에서 `frida -U -f ... -l script.js` 실행 후 로그를 붙여넣음
- 5단계 진단은 붙여넣은 로그 기반으로 동일하게 수행

## 결과 정리

우회 성공 시 최종 보고서 문구 작성은 소스코드분석/보고서 스킬(있다면)로 연계. 없으면 최소한 다음을 기록:
- 우회 대상 로직 종류 + 구현 방식
- 우회에 사용한 최종 스크립트
- CWE 매핑 후보: CWE-295(부적절한 인증서 검증), CWE-489(디버그 코드 잔존), CWE-353(무결성 검증 누락) 등 실제 케이스에 맞게
