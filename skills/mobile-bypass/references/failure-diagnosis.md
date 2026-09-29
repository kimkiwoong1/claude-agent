# 실패 진단 체크리스트

시도가 실패했을 때 순서대로 원인 분류. "안 되네요, 다시 해볼게요"로 막 찍지 말고 아래 분기부터 밟을 것.

## 1. Frida 자체가 연결 안 됨

```bash
frida --version          # 로컬 버전
adb shell "/data/local/tmp/frida-server --version"   # 디바이스 버전
```
버전 불일치가 원인의 절반 이상. 반드시 동일 버전으로 맞출 것.

`frida-ps -U`가 아예 안 뜨면: frida-server 프로세스 살아있는지(`adb shell ps -A | grep frida`), 아키텍처 맞는 바이너리 썼는지(`arm64-v8a`인데 `arm` 바이너리 push한 경우 흔함) 확인.

## 2. 훅이 걸렸다는 로그 자체가 안 나옴

→ 클래스명/메서드 시그니처가 틀림. 원인 대부분:
- 난독화(ProGuard/R8)로 실제 클래스명이 grep 당시 본 이름과 다름 — `jadx`에서 재추출한 실제 클래스명 재확인
- Overload된 메서드에서 시그니처(파라미터 타입) 안 맞춰서 `Java.use().implementation` 이 잘못된 오버로드에 붙음 — `.overload(...)` 명시

## 3. 훅은 걸렸는데 방어로직이 여전히 작동함

→ 같은 기능을 하는 다른 클래스/경로가 병행으로 존재 (이중 방어), **또는 여러 모듈을 합칠 때 같은 Java 메서드를 두 번 override해서 뒤의 것이 앞의 것을 덮어쓴 경우** (`references/hook-merging.md` 참고 — 이 경우 로그에 Hooked 메시지가 기대한 개수보다 적게 찍힘).
- grep 범위를 넓혀서 (`security-logic/*.md`의 다른 패턴들도) 놓친 후보 있는지 재확인
- 병합한 스크립트라면 각 훅의 로그가 전부 찍히는지부터 확인
- 네이티브(.so) 레벨에서 별도로 체크하는 경우 → 4번으로

## 4. 앱이 훅 시점 또는 직후 크래시

→ anti-frida가 먼저 작동해서 강제종료됨. `security-logic/anti-frida.md` 우회를 먼저 걸고 재시도.
- `-f` (spawn) 대신 이미 실행 중인 프로세스에 `-p <pid>`로 지연 attach 시도 (초기 무결성체크 타이밍을 지나친 후 붙기)
- frida-server 프로세스명/포트 변경

## 5. 네이티브(.so) 레벨 체크로 jadx에 안 보임

→ Java 레벨 grep으로는 원천적으로 안 잡히는 경우. `references/native-lib-analysis.md`의 Ghidra 워크플로우로 전환.
```bash
frida-trace -U -i "*" -f <package.name>   # 네이티브 함수 호출 전체 추적, 의심되는 함수명 패턴 찾기
```
심볼이 스트립되어 있으면 오프셋 기반 훅 필요 — `native-lib-analysis.md` 참고해서 Ghidra로 오프셋 확인 후 진행. 시간이 걸리는 단계이니 착수 전 사용자에게 소요시간 안내.

## 6. 루팅/환경 자체 문제

→ 방어로직 문제가 아니라 애초에 su가 노출되어 있어서 RootBeer 이전 단계에서 걸리는 경우. Magisk DenyList/Shamiko 설정부터 재점검.

## 7. 크래시는 아닌데 훅 걸고도 앱이 스스로 종료됨 (지연 kill)

logcat에 `FATAL EXCEPTION`/`Fatal signal`이 아니라 `VM exiting with result code 0` 만 찍히는 경우 — 크래시가 아니라 앱이 의도적으로 자기 자신을 종료시키는 정상 종료 경로임. 탐지 시점과 종료 시점이 시간적으로 분리된 경우(예: 코루틴/Handler로 몇 초 지연 후 종료)가 많아서, 개별 탐지 메서드를 다 찾아 무력화해도 "그때는 통과했는데 몇 초 뒤에 또 죽는" 것처럼 보여 실패로 오판하기 쉬움.

이 경우 개별 탐지 로직(1~3번 분기)을 계속 쫓기 전에 **종료 실행 지점부터 선제적으로 후킹**해서 막아볼 것:
```js
Java.use("java.lang.Runtime").exit.implementation = function (code) { /* no-op */ };
Java.use("android.app.Activity").finishAffinity.overload().implementation = function () { /* no-op */ };
// 필요시 android.os.Process.killProcess(int) 도 동일하게
```
탐지 로직 자체는 그대로 두고(로그로 계속 관찰 가능) 그 결과로 이어지는 종료 액션만 끊는 방식이라, 난독화로 병합/은닉된 탐지 클래스를 일일이 찾아 대응하는 것보다 훨씬 빠르게 우회되는 경우가 많음.

**실사례**: RootBeer 표준 라이브러리를 쓰는 앱에서 R8이 개별 체크 메서드들을 `MainActivity.onCreate()` 안에 통째로 인라이닝해버려서 jadx 기본 옵션으로는 디컴파일에 실패했음(아래 팁 참고). `Runtime.exit`+`finishAffinity` 두 줄만으로 우회 성공했고, logcat으로 확인해보니 RootBeer의 su 바이너리 탐지 로그는 계속 정상적으로 찍히고 있었음(탐지는 살아있지만 종료 액션만 무력화된 상태). 이후 `--show-bad-code`로 재디컴파일해서 실제 트리거 조건도 확인함: 탐지 체인 결과를 `z3`(비루팅 여부) 변수에 모아서 `if (!z3) { Toast("루팅된 단말기에서는 사용할 수 없습니다"); 킬 코루틴 실행; }` 형태로, 탐지와 종료가 명시적으로 연결되어 있었음 — 다만 우회 자체는 이 조건을 몰라도 이미 성공한 상태였음.

**팁 — jadx가 특정 메서드 디컴파일에 실패하는 경우** (`Method not decompiled`, `Code decompiled incorrectly` 주석과 함께 메서드 본문이 `throw new UnsupportedOperationException(...)`으로만 나오는 경우): apktool/baksmali로 넘어가기 전에 먼저 `jadx --show-bad-code -d <출력폴더> <apk>`로 같은 APK를 재디컴파일해볼 것. 완벽한 코드는 아니지만(변수명 재사용, 잘못된 분기 등 왜곡 있음) 로직 구조와 호출 순서를 파악하기엔 대부분 충분하고, 별도 도구 설치 없이 jadx 하나로 해결되는 경우가 많음. 그래도 안 되면 apktool(smali 덤프)로 넘어갈 것 — Windows 환경에서 APK Easy Tool 같은 GUI 도구를 쓰는 경우 apktool jar가 이미 내장되어 있는 경우가 많으니 별도 설치 전에 먼저 확인.

**예외 — 종료 지점이 여러 개인 상태머신 액티비티는 이 방법이 오히려 역효과**: 위 방법은 "탐지 한 번 → 즉시 종료"인 단순한 흐름을 전제로 함. 보안 액티비티가 Handler 기반 상태머신이라 진행바/DB에러/권한요청/루팅결과 등 서로 다른 이유로 `finish()`/`finishAffinity()`가 여러 곳에서 호출되는 구조라면, 종료 지점을 통째로 막았을 때 "종료됐어야 하는데 안 됨" 상태로 꼬여서 다이얼로그가 중첩되는 등 UI가 깨질 수 있음. 실제로 RaonSecure TouchEn mVaccine(`BackgroundScanActivity`)에서 이 부작용이 확인됨. **판단 기준**: 훅 적용 후 앱이 "죽거나" "깨끗하게 통과하거나" 둘 중 하나가 아니라 화면이 눈에 띄게 깨지거나 다이얼로그가 쌓이면, 종료 지점을 막는 대신 실제 판정이 나오는 JNI 경계(해당 Activity가 들고 있는 스캐너/엔진 객체를 따라가서 `native` 선언이 있는 클래스를 찾아 그 반환값을 조작)로 접근할 것.

## 보고 원칙

원인 파악 후 재시도할 때마다 "무엇을 바꿨는지 + 어느 분류(1~6)에 해당했는지"를 한 줄로 보고. 사용자가 진행상황을 추적할 수 있어야 함.
