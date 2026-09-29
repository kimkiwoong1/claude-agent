# 루팅 탐지 우회

## 구현 패턴별 식별

| grep로 나온 것 | 탐지 방식 | 우회 접근 |
|---|---|---|
| `RootBeer` 라이브러리 | 다중 체크(su바이너리, 패키지명, 빌드태그) 통합 | `bypass-templates/root-rootbeer.js` — RootBeer 클래스의 각 `isRooted*` 메서드 전부 false 강제 리턴 |
| `su` 바이너리 경로 직접 체크 (`/system/bin/su`, `/system/xbin/su` 등) | 파일 존재 체크 | Magisk DenyList/Shamiko로 애초에 su 경로 숨김이 우선. 스크립트 레벨로도 우회하려면 `bypass-templates/file-exists-guard.js` 사용 (에뮬레이터탐지와 File.exists를 공유하므로 개별 훅 금지 — `references/hook-merging.md` 참고) |
| `test-keys` 빌드태그 체크 | `Build.TAGS` 체크 | `Build.TAGS` 필드 리플렉션 훅으로 값 치환 |
| `getprop ro.build.tags`, `ro.debuggable` 등 프로퍼티 직접 실행 | `Runtime.exec("getprop ...")` | `Runtime.exec` 훅해서 su/getprop 관련 명령만 결과 조작 |
| SafetyNet / Play Integrity API | 구글 서버 검증 (하드웨어 attestation 포함) | Frida 레벨 우회 사실상 불가능. Universal SafetyNet Fix(Magisk 모듈) 필요, 그래도 최신 Play Integrity의 hardware attestation은 우회 난이도 매우 높음 — 범위 초과시 사용자에게 명시적으로 알릴 것 |

## 우선순위

1. Magisk Zygisk + DenyList/Shamiko로 대상 앱에서 su 존재 자체를 숨기는 게 1순위 (Frida 스크립트보다 안정적)
2. 그래도 탐지되면 RootBeer류 라이브러리 훅으로 보강
3. SafetyNet/Play Integrity가 걸려있으면 별도 사용자와 협의 필요 (일반 Frida 훅 범위를 넘어감)

## 흔한 실패 원인

앱이 여러 탐지 방식을 동시에 씀 (RootBeer + 직접 su 체크 + getprop 체크 병행). 하나 우회했다고 성공 아님 — grep으로 나온 모든 후보 클래스 동시에 훅해야 함.
