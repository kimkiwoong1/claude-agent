# 상용 앱쉴드(다층 통합 방어 솔루션) 대응

국내 금융/공공 앱은 개별 라이브러리 조합이 아니라 **하나의 상용 SDK가 루팅탐지+Frida탐지+에뮬레이터탐지+리패키징탐지+무결성검증을 한 번에 처리**하는 경우가 대부분. 이 경우 `ssl-pinning.md`/`root-detection.md` 등 개별 카테고리 대응만으론 부족 — 벤더 시그니처부터 식별하고 그 벤더 특성에 맞는 전략으로 접근해야 함.

## 벤더 식별 (1차 grep)

```bash
grep -rli "inca\|niap\|appsuit\|nprotect\|whiterose" decompiled/       # INKA 계열
grep -rli "liapp\|lockincomp" decompiled/                              # Liapp
grep -rli "npcore\|npmain" decompiled/                                 # NPCore
grep -rli "appsealing\|seworks\|inzisoft" decompiled/                  # SEWORKS / 인지소프트
grep -rli "quixxi" decompiled/                                         # Quixxi
strings apk_extracted/lib/*/*.so | grep -iE "inca|liapp|npcore|appsealing" # 네이티브에 심어진 경우 문자열로도 확인
```

APK 내 `lib/` 폴더에 벤더명이 들어간 `.so` 파일이 그대로 있는 경우도 많음 (예: `libniap.so`, `libnprotect.so`, `liblppzq.so`) — 파일명만으로도 1차 식별 가능.

## 벤더별 특징 및 접근 방향

| 벤더 | 특징 | 접근 방향 |
|---|---|---|
| INKA (AppSuit/nProtect) | 코드 자체를 가상화(VM 난독화)하는 경우 있음, 다층 무결성체크, 네이티브 레벨 방어 강함 | Java 레벨 훅으로는 한계. `native-lib-analysis.md`의 Ghidra 워크플로우가 기본. 초기화 시점(Application.onCreate) 전 스폰 필수 |
| Liapp | DEX 암호화+런타임 복호화(패커형), 클래스 로딩 시점 후킹 어려움 | 메모리 덤프 후 복호화된 DEX 재구성 접근 필요할 수 있음 — 범위가 크므로 사용자와 시간 산정 협의 |
| NPCore | 루팅탐지+디버깅탐지 중심, 상대적으로 표준 패턴에 가까움 | root-detection.md/anti-frida.md 패턴 우선 적용 후 안 되면 벤더 전용 함수명(`npMain`, `npCheck` 등) 대상 개별 훅 |
| SEWORKS AppSealing | 무결성 검증 + 후킹탐지 결합, SDK 초기화 시 자체 프로세스 감시 스레드 생성 | 스레드 생성 자체를 훅해서 무력화하는 접근 고려 (`Thread.start` 오버라이드 후 해당 스레드 클래스명 필터링) |

## 공통 원칙

1. **벤더 식별을 가장 먼저** — 개별 카테고리(SSL/루팅/Frida) 대응을 시도하기 전에 벤더 SDK인지부터 확인. 벤더 SDK면 개별 그렙 패턴이 무의미할 수 있음 (탐지로직이 SDK 내부에 캡슐화되어 클래스명이 벤더 자체 네이밍을 씀)
2. **초기화 시점을 노려야 함** — 대부분 `Application.onCreate()`나 `SDK.init()` 시점에 전체 방어체계가 세팅됨. 이미 초기화 끝난 후 attach하면 우회 불가능한 경우가 많음 → **반드시 spawn(`-f`) 방식으로 프로세스 생성 시점부터 훅**
3. **시간 산정을 미리 사용자와 협의** — 특히 INKA/Liapp처럼 코드 가상화/패킹까지 걸린 경우 며칠 단위 리버싱이 될 수 있음. `failure-diagnosis.md` 루프를 무한정 반복하지 말고, 벤더 식별 시점에 난이도를 사용자에게 먼저 보고
4. **탐지 자체보다 우회증거 확보가 목적** — 실제 모의해킹에서는 완전 우회 성공보다 "다층 방어에도 불구하고 어느 지점까지 뚫렸는지"를 문서화하는 게 산출물로 더 중요한 경우가 많음. 완전 우회 실패해도 도달한 단계까지는 보고서에 기록할 것
