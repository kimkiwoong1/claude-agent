# 환경/프레임워크 판별

APK 구조만 보고 빠르게 판별. 판별 결과에 따라 이후 우회 전략이 완전히 달라짐.

## 판별 체크리스트

```bash
unzip -l target.apk | grep -E "flutter_assets|libflutter|index.android.bundle|libhermes|libreactnative"
```

| 시그니처 | 프레임워크 | 특징 |
|---|---|---|
| `assets/flutter_assets/`, `lib/*/libflutter.so` | Flutter | Dart AOT 컴파일, jadx로 로직 안 보임 |
| `assets/index.android.bundle` | React Native (JS) | JS 번들 그대로 노출, 압축만 돼있음 |
| `lib/*/libhermes.so` | React Native (Hermes) | 바이트코드 컴파일, JS 번들 직접 못 봄 |
| 위 셋 다 없음, `classes.dex`만 | Native (Java/Kotlin) | jadx 디컴파일 정상 동작 |

## 프레임워크별 후속 전략

### Native (Java/Kotlin)
- jadx 디컴파일 → 표준 grep 패턴 그대로 적용 (SKILL.md 2단계)
- Frida 훅은 클래스명.메서드명으로 직접 접근 가능
- 가장 다루기 쉬움, 대부분의 bypass-templates 그대로 적용

### Flutter
- jadx 무용지물. `libflutter.so`가 실제 로직을 담고 있음
- SSL Pinning은 자체 TLS 스택(BoringSSL 정적링크) 사용 → 표준 OkHttp 훅 안 먹힘
- 대안: `frida-flutter`, 또는 `SSLContext` 레벨이 아닌 `ssl_verify_peer_cert` 함수를 오프셋으로 직접 훅 (Blutter로 오프셋 추출 필요)
- 심볼 정보 없으면 리버싱 난이도 급상승 — Ghidra 기반 분석 워크플로우는 `references/native-lib-analysis.md` 참고. Flutter는 거의 항상 이 경로로 넘어가게 됨.

### React Native (JS 번들)
- `index.android.bundle` 그대로 있으면 `unzip`으로 추출 후 텍스트 검색 가능 (난독화는 돼있어도 문자열은 남음)
- Hermes bytecode면 `hermes-dec` 등 별도 디컴파일러 필요
- 네트워크 로직은 보통 JS 레벨의 fetch/axios 래퍼 → 네이티브 SSL 훅보다 JS 레벨 후킹(`frida` + JS 컨텍스트 접근)이 더 확실할 때 있음

## 루팅/디바이스 상태 확인

```bash
adb shell su -c id          # 루팅 성공 여부
adb shell getprop ro.build.tags   # test-keys면 커스텀롬/루팅 가능성
```
Magisk 사용 시 Zygisk + DenyList(또는 Shamiko)로 대상 앱에서 su 존재 자체를 숨기는 게 기본. 이게 안 돼있으면 루팅탐지 우회가 애초에 절반은 실패한 상태로 시작하는 것.
