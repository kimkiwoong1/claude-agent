# 파라미터/인젝션포인트 퍼징 (wfuzz)

디렉토리 퍼징으로 확보한 엔드포인트를 대상으로, 숨은 파라미터 발견 + 인젝션 취약점 후보 좁히기.

## 숨은 파라미터 발견

```bash
wfuzz -c -z file,params-wordlist.txt --hw <정상응답단어수> "https://$TARGET/endpoint?FUZZ=test"
```
- `--hw`(hide words): 파라미터가 없어도 항상 나오는 기본 응답 크기를 숨겨서, **응답이 달라지는 파라미터만** 결과에 남김
- 이게 실제로 서버가 그 파라미터를 처리한다는 신호 (존재하는 파라미터일 가능성)

## 파라미터 값 퍼징 — 인젝션 포인트 후보

이미 알려진 파라미터에 인젝션 페이로드 넣어서 응답 차이 확인:

```bash
# SQLi 후보 확인 (에러기반)
wfuzz -c -z file,sqli-payloads.txt --hc 404 "https://$TARGET/endpoint?id=FUZZ"

# XSS 반사 확인 (페이로드가 그대로 응답에 반영되는지)
wfuzz -c -z file,xss-payloads.txt --hc 404 --show-field=text "https://$TARGET/endpoint?q=FUZZ"

# LFI 후보 확인
wfuzz -c -z file,lfi-payloads.txt --hc 404 "https://$TARGET/endpoint?file=FUZZ"
```

## 다중 파라미터 동시 퍼징

파라미터 두 개 이상을 각각 다른 워드리스트로 동시에 돌릴 때:

```bash
wfuzz -c -z file,users.txt -z file,passwords.txt --hc 401 "https://$TARGET/login?user=FUZZ&pass=FUZ2Z"
```
`FUZZ`, `FUZ2Z` 순서대로 각 `-z` 옵션과 매칭됨.

ffuf로 동일 작업할 때는 pitchfork 모드(각 워드리스트 같은 인덱스끼리 짝지어 순회) 사용:
```bash
ffuf -w users.txt:USER -w passwords.txt:PASS -X POST -d "username=USER&password=PASS" -u https://$TARGET/login -mode pitchfork -fc 401
```

## 응답 본문 기반 필터링 (에러 문자열 탐지)

특정 에러 메시지가 응답에 포함되는지로 판단할 때 정규식 필터 활용:
```bash
ffuf -w sqli-payloads.txt -u "https://$TARGET/endpoint?id=FUZZ" -mr "SQL syntax|mysql_fetch|ORA-[0-9]"
```
`-mr`(match regex)로 DB 에러 문자열이 실제로 뜨는 요청만 결과에 남김 — SQLi 에러기반 탐지에 특히 유용.

## HTTP 메서드/헤더 퍼징

파라미터뿐 아니라 헤더 인젝션, 메서드 우회도 흔한 후보:

```bash
# X-Forwarded-For, X-Original-URL 등 우회 헤더 퍼징
wfuzz -c -z file,headers-wordlist.txt -H "FUZZ: 127.0.0.1" --hc 403 "https://$TARGET/admin"
```

## 응답 차이 기반 판단 원칙 (블랙박스 핵심)

블랙박스는 소스코드를 못 보니까 **응답의 미세한 차이**가 유일한 단서:
- 응답 크기(`--hw`/`--hh`로 필터링)
- 응답 시간 (시간기반 블라인드 SQLi 의심 시 `time` 페이로드로 지연 확인)
- 상태코드 변화
- 에러 메시지 노출 여부 (스택트레이스, DB 에러 문자열 등 — 이게 나오면 그 자체로 정보노출 취약점이자 인젝션 확인 신호)

## 결과 필터링 — 노이즈 제거

WAF가 걸려있으면 거의 모든 페이로드에 동일한 차단 응답(예: 403 + 특정 크기)이 뜨는 경우 많음 — 이 패턴부터 베이스라인으로 잡고 필터링 (`rate-limit-waf-evasion.md` 참고). 필터링 안 하면 결과 전부가 노이즈로 뒤덮여서 진짜 취약점 후보를 놓침.
