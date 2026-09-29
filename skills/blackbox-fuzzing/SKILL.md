---
name: blackbox-fuzzing
description: "Use this skill for black-box penetration testing reconnaissance and fuzzing workflows — subdomain/asset discovery, asset role and criticality classification from naming patterns and tech fingerprints (e.g. recognizing a hotel PMS, VPN gateway, or admin console from its domain name), cloud asset enumeration (S3/Azure Blob/GCS buckets, cloud metadata endpoints), web directory/endpoint fuzzing, and parameter/injection-point fuzzing using ffuf, gobuster, and wfuzz. Trigger whenever the user starts a black-box assessment with only a domain/IP/company name as input, mentions asset discovery, subdomain enumeration, directory brute-forcing, fuzzing endpoints or parameters, cloud bucket enumeration, prioritizing which assets to test first, or wants to move from recon into active fuzzing. Also trigger for the workflow of narrowing a large attack surface down to actionable findings, going from recon to asset inventory to fuzzing to triaging results to deep-diving on candidates."
---

# Blackbox Fuzzing & Asset Discovery Workflow

블랙박스 모의침투에서 "도메인/회사명만 주어진 상태"부터 시작해서 실제 취약점 후보까지 좁혀가는 정찰-퍼징 통합 워크플로우.

전체 흐름: **범위 확정 → 자산탐지(서브도메인/IP/클라우드) → 자산 역할/중요도 분류 → 포트/서비스 확인 → 웹 엔드포인트 퍼징 → 파라미터 퍼징 → 결과 트리아지**

## 0단계: 범위 확정 (가장 먼저, 매번 필수)

블랙박스라도 무허가 대상 스캔은 금지. 시작 전에 반드시 확인:
- 계약서/RoE(Rules of Engagement)에 명시된 스코프 도메인/IP 대역
- 스코프 밖 자산이 탐지되면(예: 서브도메인이 제3자 CDN/SaaS로 연결) 그 자산은 건드리지 않고 목록에만 기록, 고객에게 확인 요청

```bash
# 스코프 문서에 명시된 도메인/CIDR 미리 변수로 고정
export SCOPE_DOMAIN="target.co.kr"
export SCOPE_CIDR="203.0.113.0/24"   # 예시
```

## 1단계: 자산탐지 (서브도메인 + IP + 클라우드)

`references/asset-discovery.md` 참고. 서브도메인 목록 확보 후 살아있는 호스트만 필터링:

```bash
# 서브도메인 열거 (subfinder/amass는 별도 설치 필요, 없으면 crt.sh 등 수동 병행)
subfinder -d $SCOPE_DOMAIN -o subdomains.txt

# 생존 호스트 필터링
cat subdomains.txt | httpx -silent -o alive.txt
```

클라우드 자산(버킷 등)까지 탐지 범위면 `references/cloud-asset-discovery.md`로 별도 진행 — **단, 무작정 이름 브루트포스부터 하지 말고, 방금 확보한 서브도메인들의 CNAME 레코드부터 확인해서 실제 클라우드 사용 흔적(버킷명이 이미 DNS에 노출된 경우)을 먼저 찾을 것**. 흔적 없으면 그때 브루트포스로 넘어감.

## 1.5단계: 자산 역할/중요도 분류

자산 목록이 많으면(수십~수백 개) 전수조사보다 우선순위 기반 조사가 현실적. `references/asset-role-classification.md` 참고해서 도메인명 패턴 + 기술스택 핑거프린트로 "이게 뭐하는 시스템일지" 1차 추정하고 중요도(상/중/하) 표 작성.

예: 도메인에 `opera`/`pms`가 들어가면 호텔 PMS 시스템일 가능성(매우높음 등급), `admin`/`vpn`이 들어가면 관리콘솔/내부망 진입점 가능성. 업종별 벤더 시그니처는 reference 문서의 표 참고, 새 패턴 발견하면 그 표에 계속 추가.

이 표가 이후 3~4단계 진행 순서를 결정 (중요도 "상"부터 우선) + 보고서의 자산 인벤토리 섹션 초안으로도 재사용.

표 완성되면 임시 마크다운으로 남기지 말고 `scripts/export_asset_inventory.py`로 xlsx 자산 인벤토리까지 바로 만들 것 (중요도별 색상강조 포함, 보고서 첨부·고객사 공유 그대로 가능):

```bash
python scripts/export_asset_inventory.py assets.csv asset_inventory.xlsx --target <대상도메인/회사명>
```

## 2단계: 포트/서비스 확인

```bash
nmap -sV -T4 --top-ports 1000 -iL alive_ips.txt -oA nmap_scan
```
웹 서비스(80/443/8080/8443 등) 확인된 호스트만 3단계로 넘김. 다른 서비스(SSH, DB 등)는 별도 트랙으로 분리.

## 3단계: 웹 엔드포인트 퍼징

`references/directory-fuzzing.md` 참고. ffuf 기준 기본 흐름:

```bash
ffuf -u https://$TARGET/FUZZ -w wordlist.txt -mc 200,301,302,403 -o result.json -of json
```

**주의**: 무작정 큰 워드리스트로 전체 갈기지 말고, `references/wordlist-strategy.md`에서 타겟 기술스택(eGovFrame/JEUS/Nexacro 등 확인되면 그에 맞는 워드리스트)부터 좁혀서 시작 — 노이즈와 시간 둘 다 줄어듦.

## 4단계: 파라미터/인젝션포인트 퍼징

디렉토리 퍼징에서 나온 엔드포인트 대상으로 실제 파라미터 값 퍼징. `references/parameter-fuzzing.md` 참고 (wfuzz 중심, 숨은 파라미터 발견 + 인젝션 포인트 후보 좁히기).

```bash
wfuzz -c -z file,paramlist.txt --hw <정상응답단어수> "https://$TARGET/endpoint?FUZZ=test"
```

## 5단계: 결과 트리아지

- False positive 제거: `references/rate-limit-waf-evasion.md`에서 WAF가 만들어내는 가짜 200/403 패턴 확인
- 유의미한 엔드포인트/파라미터만 추려서 심화 분석(수동 테스트, Burp Repeater)으로 넘김
- 다른 스킬과 연계 가능: 발견된 엔드포인트가 인증서버/파일업로드 등이면 각 상황별 수동 점검으로 전환

## 실무 원칙

- **속도보다 정확도**: 블랙박스 초반 자산탐지 단계에서 놓친 자산은 이후 단계 전체에서 안 보임 — 서브도메인 열거는 여러 소스(수동 crt.sh, subfinder, 클라우드 프로바이더 흔적)를 교차 확인
- **Rate limit 준수**: 상용 앱쉴드/WAF 걸린 대상은 과도한 요청 시 IP 차단됨 (`-p`, `-t` 옵션으로 속도 조절 — `references/rate-limit-waf-evasion.md`)
- **결과는 항상 재현 가능하게 저장**: `-o` 옵션으로 매 단계 결과 파일로 남길 것 (보고서 근거자료로 그대로 활용 가능)
