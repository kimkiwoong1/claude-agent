# 에뮬레이터 탐지 우회

금융앱은 에뮬레이터에서 아예 실행을 막는 경우가 흔함. 실제 단말기가 아니라 Nox/MEmu 등으로 테스트하는 환경이면 이 단계부터 걸릴 수 있음.

## 구현 패턴별 식별

```bash
grep -rli "build.fingerprint\|build.model\|goldfish\|ranchu\|genymotion\|qemu\|telephonymanager.getdeviceid" decompiled/
```

| 체크 방식 | 탐지 대상 | 우회 접근 |
|---|---|---|
| `Build.FINGERPRINT`, `Build.MODEL`, `Build.MANUFACTURER` 등 문자열에 `generic`, `sdk`, `Android SDK built for x86`, `Genymotion` 포함 여부 | 빌드 프로퍼티 기반 | 해당 필드 리플렉션 훅해서 실기기 값(예: 삼성 실제 모델명)으로 치환 |
| `/dev/socket/qemud`, `/dev/qemu_pipe` 파일 존재 체크 | QEMU 파일 흔적 | `scripts/bypass-templates/file-exists-guard.js` 사용 (루팅탐지 File.exists 훅과 통합된 버전 — 개별로 File.exists를 또 override하면 충돌남, `references/hook-merging.md` 참고) |
| `TelephonyManager.getDeviceId()`, `getSubscriberId()` 가 null/0 반환 | 에뮬레이터는 통상 IMEI 없음 | 해당 메서드 훅해서 그럴듯한 더미 IMEI 리턴 |
| 센서 목록 체크 (`SensorManager.getSensorList()`가 비어있거나 개수 적음) | 에뮬레이터는 가속도계 등 센서 부족 | 센서 리스트 훅으로 더미 센서 배열 리턴 (구현 난이도 있음, 실기기로 테스트하는 게 더 빠를 수 있음) |
| CPU 정보 (`/proc/cpuinfo`에 `intel`/`vbox` 문자열) | x86 에뮬레이터 특징 | 파일 읽기 훅으로 arm 관련 문자열로 치환 |

## 실무 팁 — 우회보다 실기기 사용이 나을 때가 많음

에뮬레이터 탐지는 위처럼 개별 우회 가능하지만, 지금 스킬의 전제(Magisk 루팅된 실물 갤럭시 등)처럼 **실기기로 테스트하는 게 압도적으로 빠르고 확실함**. 에뮬레이터 우회에 시간 쏟기보다:
1. 실기기 있으면 그냥 실기기로 진행 (에뮬레이터 탐지 자체가 무의미해짐)
2. 실기기가 없어서 에뮬레이터가 필수인 상황에서만 위 우회 적용

Frida 자체도 에뮬레이터에서 추가 이슈(아키텍처 x86 frida-server 필요, 성능저하로 타임아웃 등)가 생기기 쉬우므로, 가능하면 항상 실기기 우선.
