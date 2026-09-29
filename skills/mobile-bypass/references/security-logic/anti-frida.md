# Frida/디버깅 탐지 우회

이 우회는 항상 **다른 모든 우회보다 먼저** 걸려야 함. anti-frida가 먼저 앱을 죽이면 이후 SSL/루팅탐지 우회 스크립트가 걸릴 기회 자체가 없음.

## 구현 패턴별 식별

| grep로 나온 것 | 탐지 방식 | 우회 접근 |
|---|---|---|
| `/proc/self/status`의 `TracerPid` 필드 체크 | ptrace 기반 디버거 탐지 | `bypass-templates/anti-frida-tracerpid.js` — 파일 읽기 훅해서 TracerPid 라인 조작, 혹은 frida-server 이름 변경(`frida-server` → 임의명)으로 우회 |
| `/proc/self/maps`, `/proc/<pid>/maps` 스캔해서 "frida", "gum-js-loop", "linjector" 등 문자열 탐색 | 메모리맵 기반 탐지 | frida-server 재컴파일해서 시그니처 문자열 변경 필요 (스크립트 레벨 우회 한계 있음), 혹은 frida-gadget 방식으로 전환 검토 |
| 포트 스캔 (`27042` 기본 frida 포트) | 네트워크 기반 탐지 | frida-server 실행 시 `-l 0.0.0.0:<임의포트>` 로 기본포트 회피 |
| `Debug.isDebuggerConnected()` | JDWP 디버거 탐지 | 해당 메서드 훅해서 false 강제 리턴 (Frida 자체는 안 잡히지만 병행 방어일 수 있음) |
| 함수 이름에 자체 무결성 체크(`ptrace(PTRACE_TRACEME, ...)` 자가호출) | anti-ptrace 셀프트레이스 | 네이티브 레벨, `frida-trace`로 호출 시점 확인 후 해당 syscall 자체를 우회하거나 seccomp 필터 이슈 검토 |

## 실무 팁

- frida-server 실행 파일명을 표준 `frida-server`가 아닌 임의 이름으로 바꾸고 실행하면 문자열 기반 탐지 상당수 우회됨 (가장 저비용 대응)
- `frida -U -f <pkg> --no-pause` 대신 spawn gating이나 지연 attach로 초기 무결성체크 타이밍을 피해가는 것도 방법
- 최신 anti-frida 솔루션(상용 앱쉴드 등)은 다층 방어라 스크립트 하나로 안 끝남 — 여러 개 병행 훅 후에도 계속 크래시하면 `failure-diagnosis.md`의 네이티브 레벨 항목으로 넘어갈 것
