# 웹 디렉토리/엔드포인트 퍼징 (ffuf/gobuster)

## 기본 흐름

```bash
ffuf -u https://$TARGET/FUZZ \
  -w /path/to/wordlist.txt \
  -mc 200,204,301,302,307,401,403 \
  -fc 404 \
  -ac \
  -t 40 \
  -o result.json -of json
```

- `-ac`: 자동 캘리브레이션 (아래 "False Positive 필터링" 섹션 참고) — 특별한 이유 없으면 항상 켜둘 것

- `-mc`: 매치할 상태코드. 404만 제외하지 말고 401/403도 포함 — 인증 필요한 관리자 페이지 등이 여기 걸림
- `-fc`: 확실히 노이즈인 코드 제외
- `-t`: 동시 스레드. 대상이 WAF/rate-limit 있으면 낮출 것 (`rate-limit-waf-evasion.md` 참고)

## 확장자 퍼징 (백업파일, 설정파일 노출 확인)

```bash
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -e .bak,.old,.zip,.tar.gz,.sql,.log,.env,.config,.xml -mc 200 -o ext_result.json -of json
```
국내 WAS 환경(JEUS/Tomcat)에서 자주 나오는 것: `.jsp.bak`, `web.xml.bak`, `domain.xml.bak` 같은 배포 실수 파일 — 확장자 리스트에 이런 것도 포함.

## 재귀적 퍼징 (하위 디렉토리 자동 탐색)

```bash
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -recursion -recursion-depth 2 -mc 200,301 -o recursive_result.json -of json
```
깊이 제한 필수 — 안 걸면 시간 무한정 늘어남.

## gobuster로 동일 작업 (도구 선택은 상황따라)

```bash
gobuster dir -u https://$TARGET -w wordlist.txt -x php,jsp,asp,aspx -o gobuster_result.txt -t 40
```
ffuf보다 필터링 옵션은 단순하지만 속도가 더 빠른 경우 있음 — 1차 스캔은 gobuster로 빠르게, 후보 나오면 ffuf로 정밀 필터링하는 조합도 흔히 씀.

## False Positive 필터링 (커스텀 404 페이지 대응)

많은 사이트가 존재하지 않는 경로에도 200을 리턴함(커스텀 에러페이지). ffuf 자체에 자동 캘리브레이션 기능이 있어서 수동으로 베이스라인 잴 필요 없음:

```bash
# 자동 캘리브레이션 - 사실상 항상 켜둘 것
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -ac -o result.json -of json

# 여러 호스트를 한 번에 돌릴 때 - 호스트별로 각각 캘리브레이션
ffuf -u https://FUZZ2.$TARGET/FUZZ -w hosts.txt:FUZZ2 -w wordlist.txt:FUZZ -ach -o result.json -of json

# 특정 문자열 패턴(예: "페이지를 찾을 수 없습니다" 같은 커스텀 에러 문구)로 캘리브레이션 기준을 직접 지정하고 싶을 때
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -acc "찾을 수 없습니다" -o result.json -of json
```

`-ac`가 자동으로 랜덤 경로 몇 개를 찔러보고 "이게 항상 나오는 가짜 200 패턴이구나"를 스스로 판단해서 걸러줌 — 수동으로 `-fw`/`-fs` 값 계산하는 것보다 훨씬 안정적이고 빠름. **결과 분석 시간을 줄이려면 `-ac`는 사실상 항상 켜둘 것.**

수동으로 직접 확인하고 싶은 경우에만 아래처럼 베이스라인 직접 측정:
```bash
curl -s https://$TARGET/definitely-not-a-real-path-12345 | wc -w
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -fw <베이스라인단어수> -o result.json -of json
```

## 국내 WAS/프레임워크별 흔한 노출 경로 (우선 체크)

grep으로 기술스택 먼저 확인(`httpx -tech-detect` 결과 참고) 후 해당 패턴 추가:

```
# JEUS
/webadmin/, /jeus/, /domain.xml

# eGovFrame
/uat/uia/, /cmm/, /egovframework/

# Tomcat
/manager/html, /host-manager/html, /examples/

# Nexacro/WebSquare
/nexacroplatform/, /websquare/websquare.html
```
이런 프레임워크 전용 경로는 범용 워드리스트(SecLists 등)에 잘 없는 경우 많음 — `wordlist-strategy.md`에서 타겟 스택별 커스텀 워드리스트로 별도 관리.

## 결과 해석 원칙

- 200뿐 아니라 301/302 redirect도 실제 존재하는 경로일 확률 높음 — 리다이렉트 목적지까지 따라가서 확인
- 403은 "존재하지만 접근제어 있음" — 이 자체가 발견(경로 유추 가능성 노출)이고, 추가로 우회 시도(HTTP 메서드 변경, 경로 조작 `..;/`) 가치 있음
