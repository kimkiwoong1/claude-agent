# SSL/Certificate Pinning 우회

## 구현 패턴별 식별

| grep로 나온 것 | 구현 방식 | 우회 스크립트 |
|---|---|---|
| `okhttp3.CertificatePinner` | OkHttp 표준 pinning | `bypass-templates/ssl-okhttp.js` |
| `X509TrustManager` 커스텀 구현 + `checkServerTrusted` | TrustManager 레벨 커스텀 | `bypass-templates/ssl-trustmanager.js` |
| `HostnameVerifier` 커스텀 | 호스트네임 검증 | `bypass-templates/ssl-hostnameverifier.js` |
| `NetworkSecurityConfig` (res/xml/network_security_config.xml) | 매니페스트 레벨 pinning | APK 재패키징으로 config 제거 후 재서명 필요 (Frida로 우회 불가) |
| Flutter (libflutter.so 내부) | BoringSSL 정적링크 | `env-triage.md`의 Flutter 섹션 참고, 표준 스크립트 안 먹힘 |

## 범용 우회 원칙

거의 모든 케이스는 `javax.net.ssl.X509TrustManager`를 전부 신뢰하는 커스텀 구현으로 교체 + `SSLContext.init()`을 그 구현으로 재초기화하는 게 핵심. 앱마다 어느 클래스가 실제 TrustManager를 쓰는지만 다름.

동시에 여러 레이어(OkHttp CertificatePinner + 커스텀 TrustManager)가 이중으로 걸려있는 경우가 흔함 — 하나만 우회하고 안 된다고 판단하지 말고 grep 결과에 나온 후보 전부 훅.

## 검증 방법

Burp 프록시 인증서를 신뢰 안 하는 상태에서 앱 실행 → 우회 스크립트 적용 후 Burp에 트래픽이 잡히는지로 성공 확인. 트래픽이 안 잡히면:
- 프록시 설정 자체 문제(사용자 CA 설치 여부, Android 7+ 는 시스템 트러스트스토어에 사용자 CA 자동 미신뢰라 network_security_config 조작 또는 루팅 후 시스템 스토어에 직접 심어야 함)와 pinning 우회 실패를 구분해서 진단할 것
