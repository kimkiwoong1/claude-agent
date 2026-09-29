# 환경 사전 하드닝 (다층방어 대응 전 필수 세팅)

금융앱처럼 상용 앱쉴드가 걸린 대상은 시작부터 탐지 안 되는 상태를 만들어놓는 게 이후 루프 반복 횟수를 크게 줄임. "문제 생기면 그때 대응"이 아니라 **분석 시작 전에 아래를 전부 선행**할 것. SKILL.md 0단계 다음, 1단계 진입 전에 수행.

## 1. Magisk 은닉

```bash
# Magisk Manager 앱 자체를 다른 이름/패키지로 위장 (Magisk 설정 > App은 숨기기)
# adb로 직접 확인:
adb shell pm list packages | grep -i magisk    # 아무것도 안 나와야 정상 (은닉 성공)
```
- Zygisk 활성화 + DenyList에 대상 앱 패키지 추가 (대상 앱에서 su/magisk 프로세스 자체가 안 보이게)
- Shamiko 모듈 설치 권장 (DenyList 자체 탐지를 우회하는 2차 방어 — 최신 탐지 SDK는 DenyList 존재 여부까지 체크하는 경우 있음)

## 2. Frida 흔적 제거

```bash
# frida-server 실행 파일명을 표준명이 아닌 임의 이름으로
adb push frida-server /data/local/tmp/su_helper_daemon
adb shell chmod 755 /data/local/tmp/su_helper_daemon
adb shell "/data/local/tmp/su_helper_daemon -l 0.0.0.0:9999 &"   # 기본포트(27042) 대신 임의포트
```
- `frida -U -H 127.0.0.1:9999 ...` 형태로 임의 포트 지정해서 연결
- 가능하면 frida-server 방식보다 frida-gadget(SO 인젝션) 방식이 흔적이 더 적음 — 반복 대상이거나 방어가 강하면 gadget 방식 전환 고려

## 3. 빌드 프로퍼티 정리

```bash
adb shell getprop ro.build.tags   # "test-keys"면 커스텀롬 표시 남음 - 일부 탐지 로직이 체크
adb shell getprop ro.debuggable   # "1"이면 디버그 빌드 표시
```
가능하면 공식 롬 기반 루팅(스톡 롬 + Magisk)을 쓰는 게 커스텀롬보다 탐지 표면이 적음.

## 4. 패키지 시그니처/설치 흔적

- Xposed/LSPosed 쓰는 경우 LSPosed Manager도 Magisk와 동일하게 은닉 설정
- 테스트용으로 설치했던 다른 후킹/분석 도구(objection, drozer agent 등) 패키지가 남아있으면 제거 — 탐지 SDK가 알려진 보안도구 패키지명 블랙리스트를 갖고 있는 경우 흔함

```bash
adb shell pm list packages | grep -iE "frida|xposed|magisk|substrate|drozer|objection"
# 나오면 안 되는 게 이상적. 나오면 은닉/제거
```

## 5. 훅 타이밍 확정 — spawn 필수

다층방어는 대부분 `Application.onCreate()` 또는 그 직후 SDK 초기화 시점에 전체 방어체계를 셋업함. 이미 실행 중인 프로세스에 `-p <pid>`로 나중에 attach하면 이미 늦은 경우가 대부분.

```bash
# 반드시 spawn 방식으로, 프로세스 생성 시점부터 훅이 걸려있어야 함
frida -U -f <package.name> -l bypass.js --no-pause
```
`commercial-shield.md`에서 다룬 벤더 SDK는 특히 이 타이밍이 중요 — 초기화 완료 후엔 방어 스레드가 이미 떠서 감시 중이라 뒤늦은 훅 자체가 탐지당함.

## 체크리스트 요약 (분석 시작 전 확인)

- [ ] Magisk Manager 은닉 + Zygisk DenyList 설정 완료
- [ ] frida-server 임의 이름/포트로 실행 중
- [ ] 알려진 보안도구 패키지 잔존 여부 확인 (없어야 함)
- [ ] spawn 방식(`-f`)으로 훅 준비 완료, attach 방식 아님
- [ ] (필요시) 실기기 사용 확인 — 에뮬레이터면 `emulator-detection.md` 먼저 검토

이 체크리스트를 통과한 상태에서 시작해야 `failure-diagnosis.md`의 실패 원인 분류가 "환경 문제"가 아니라 "실제 방어로직 문제"로 좁혀짐 — 진단 효율이 크게 올라감.
