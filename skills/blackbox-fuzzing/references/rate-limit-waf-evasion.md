# Rate Limit / WAF 대응 및 False Positive 처리

## WAF 탐지 여부 먼저 확인

```bash
# 명백히 악성인 요청 하나 보내서 반응 확인
curl -s -o /dev/null -w "%{http_code}\n" "https://$TARGET/?id=1' OR '1'='1"
```
평소 200이 나오다가 특정 패턴에서만 403/406 등으로 바뀌면 WAF 존재 신호.

## 속도 조절

```bash
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -t 5 -p 0.5-1.5 -rate 2 -o result.json -of json
```
- `-t`: 스레드 수 낮추기 (기본 40 → WAF 있으면 5~10)
- `-p`: 요청 간 랜덤 딜레이(초) — 패턴 탐지 회피
- `-rate`: 초당 최대 요청수 직접 고정 (예: `-rate 2` = 초당 2건). `-t`보다 더 예측 가능한 속도 제어가 필요할 때 사용

## WAF 차단 패턴을 베이스라인으로 필터링

WAF가 걸리면 차단 응답이 전부 똑같은 크기/코드로 나오는 경우 많음 — 이 패턴 자체를 노이즈로 제외:

```bash
# WAF 차단 응답 크기 확인
curl -s "https://$TARGET/FUZZ_test_blocked_pattern" | wc -c

# 그 크기를 -fs(filter size)로 제외
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -fs <차단응답크기> -o result.json -of json
```

## User-Agent / 헤더 로테이션

일부 WAF는 기본 도구 User-Agent(`ffuf`, `gobuster` 등)를 즉시 차단함:

```bash
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o result.json -of json
```

## IP 차단 당했을 때

- 일정 시간 대기 후 낮은 속도로 재시도
- 가능하면 사전에 고객사와 화이트리스트 IP 협의 (모의해킹 표준 절차 — 탐지 우회가 목적이 아니라 진단이 목적인 경우 화이트리스트가 합리적)
- 실제 공격자 관점 시나리오(레드팀 성격)면 화이트리스트 없이 WAF 우회 자체가 평가 대상이 될 수 있음 — 계약 성격에 따라 접근 다르게

## False Positive 판별 체크리스트

발견된 결과가 진짜인지 판단할 때:
- [ ] 같은 경로를 브라우저로 직접 접속해서 육안 확인
- [ ] 응답 본문에 실제 콘텐츠가 있는지, 아니면 커스텀 에러페이지가 200으로 오는 건지
- [ ] 같은 상태코드/크기가 무작위 경로에서도 나오는지 (전부 200이면 와일드카드 응답 의심)
- [ ] 여러 도구(ffuf 결과 vs gobuster 결과)로 교차 검증

## 결과 신뢰도 낮추는 흔한 실수

- 필터링 없이 결과 수백 개를 그대로 보고서에 넣는 것 — 대부분 노이즈일 가능성 높음, 반드시 수동 확인 거친 것만 최종 산출물에 포함
- 재귀 퍼징(`-recursion`) 깊이 제한 없이 돌려서 같은 노이즈가 기하급수적으로 증식하는 것
