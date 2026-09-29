# 네이티브 라이브러리(.so) 분석 — Ghidra 워크플로우

jadx로 안 보이는 경우(Flutter의 libflutter.so, 혹은 Java 레벨엔 훅포인트가 없고 네이티브에 직접 박힌 SSL pinning/루팅탐지/무결성체크) 진입하는 단계. SKILL.md 2단계(보안로직 식별)에서 grep으로 아무것도 안 나오는데 방어 동작은 확인될 때 여기로 분기.

## 언제 이 단계로 오는가

- `env-triage.md`에서 Flutter로 판별된 경우 (거의 항상 필요)
- Native 앱인데 `failure-diagnosis.md` 5번(네이티브 레벨 체크)에 걸린 경우
- `frida-trace -i "*"`로 추적했을 때 의심되는 네이티브 함수가 잡혔지만 심볼이 스트립돼서 뭘 하는 함수인지 모를 때

## 0단계: 대상 .so 추출 및 1차 스캔

```bash
unzip target.apk -d apk_extracted
# 아키텍처 맞는 것 하나 고름 (디바이스와 동일 abi)
find apk_extracted/lib -name "*.so"

# 스트립 여부, 아키텍처 확인
file apk_extracted/lib/arm64-v8a/libflutter.so
nm -D apk_extracted/lib/arm64-v8a/libtarget.so 2>&1 | head -50   # 심볼 남아있는지 확인 (Flutter는 대부분 스트립됨)

# 문자열 기반 1차 힌트 (심볼 없어도 문자열은 단서가 됨)
strings apk_extracted/lib/arm64-v8a/libtarget.so | grep -iE "pinning|certificate|ssl_verify|root|frida|ptrace|tracerpid"
```

## 1단계: Ghidra 로드 및 자동분석

```bash
# Ghidra headless로 1차 자동분석 (GUI 없이 스크립트화 가능 - Claude Code에서 배치 처리 유리)
$GHIDRA_HOME/support/analyzeHeadless /tmp/ghidra_project TempProject \
  -import apk_extracted/lib/arm64-v8a/libtarget.so \
  -analysisTimeoutPerFile 600
```

GUI로 직접 열어야 하는 경우(사용자가 인터랙티브하게 보고 싶을 때)는 headless 대신 안내만 하고 사용자가 직접 열도록.

## 2단계: 타겟 함수 찾기

### Flutter (libflutter.so)의 SSL pinning
Flutter는 BoringSSL을 정적 링크해서 씀. 핵심 타겟 함수:
- `ssl_crypto_x509_session_verify_cert_chain` 또는 `ssl_verify_peer_cert` (BoringSSL 내부 함수, 버전마다 이름 다를 수 있음 — 심볼 스트립시 시그니처 패턴 매칭 필요)
- Ghidra에서 스트립된 경우, 알려진 BoringSSL 함수의 바이트 패턴으로 시그니처 검색 (Ghidra Function ID 데이터베이스 활용하면 유사 라이브러리 버전과 매칭 가능)
- 이미 커뮤니티에 공개된 오프셋 DB가 있는 경우 참고: **Blutter** (Flutter 전용 리버싱 도구, Dart 스냅샷에서 클래스/함수명 자동 복원 시도) — 이걸 먼저 돌려보고 안 되면 순수 Ghidra 수작업으로

```bash
# Blutter 시도 (있으면 훨씬 빠름)
python3 blutter.py apk_extracted/lib/arm64-v8a/ output_dir/
```

### 네이티브 루팅탐지/anti-frida
- `strings`에서 나온 `su`, `TracerPid`, `frida` 등 문자열의 **cross-reference**를 Ghidra에서 추적 (Ghidra: 문자열 더블클릭 → References → 어느 함수가 참조하는지)
- 해당 함수의 시작 주소(오프셋)를 기록

## 3단계: 오프셋 기반 Frida 훅으로 전환

Ghidra에서 찾은 함수 오프셋으로 Java 레벨이 아닌 네이티브 레벨 훅 작성:

```javascript
// scripts/bypass-templates/native-offset-hook.js 패턴
var moduleBase = Module.findBaseAddress("libtarget.so");
var targetOffset = 0x12345; // Ghidra에서 확인한 오프셋
var targetAddr = moduleBase.add(targetOffset);

Interceptor.attach(targetAddr, {
    onEnter: function (args) {
        console.log("[+] 네이티브 함수 진입: 0x" + targetOffset.toString(16));
    },
    onLeave: function (retval) {
        console.log("[+] 원본 리턴값: " + retval);
        retval.replace(0x1); // 검증 성공(true)으로 강제 - 실제 함수의 리턴 규약에 맞게 조정
    },
});
```

리턴값 규약(성공이 0인지 1인지, bool인지 포인터인지)은 Ghidra 디컴파일 결과(`Window > Decompile`)에서 반드시 확인 후 적용. 추측으로 넣으면 크래시 원인이 됨.

## 실무 팁

- 오프셋은 앱 버전 올라가면 바뀔 수 있음 — 버전 고정해서 테스트하거나, 매 버전마다 재확인 필요함을 사용자에게 미리 알릴 것
- Ghidra Function ID / BSim 같은 기능으로 오픈소스 라이브러리(BoringSSL, OpenSSL 등) 매칭하면 수작업 리버싱 시간 크게 단축됨
- 이 단계는 시간이 많이 걸림 — `failure-diagnosis.md` 5번에서 여기로 넘어올 때, 사용자에게 예상 소요시간 미리 안내(수 시간~하루 단위일 수 있음을 명확히)
