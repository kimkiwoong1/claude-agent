# 자산탐지 (서브도메인 + IP)

블랙박스 시작점. 도메인/회사명만 있는 상태에서 실제 공격표면을 넓히는 단계.

## 서브도메인 열거 — 여러 소스 교차 확인 필수

한 도구만 믿지 말 것. 소스마다 커버리지가 다름.

```bash
# 1. Certificate Transparency 로그 (가장 신뢰도 높음, 무료, API키 불필요)
curl -s "https://crt.sh/?q=%.${SCOPE_DOMAIN}&output=json" | jq -r '.[].name_value' | sort -u > crtsh.txt

# 2. subfinder (여러 수동 소스 통합, API 키 설정하면 커버리지 더 늘어남)
subfinder -d $SCOPE_DOMAIN -all -o subfinder.txt

# 3. amass (수동+능동 겸용, 시간 오래 걸리지만 깊게 훑음)
amass enum -passive -d $SCOPE_DOMAIN -o amass.txt

# 병합 + 중복제거
cat crtsh.txt subfinder.txt amass.txt | sed 's/\*\.//' | sort -u > all_subdomains.txt
```

## 생존 호스트 필터링

```bash
cat all_subdomains.txt | httpx -silent -status-code -title -tech-detect -o alive_hosts.txt
```
`-tech-detect` 옵션으로 이 시점에 기술스택(WAS/프레임워크) 힌트를 미리 확보해두면 `wordlist-strategy.md` 단계에서 바로 활용 가능.

## DNS 브루트포스 (서브도메인 워드리스트 기반 — CT로그에 안 잡히는 것 커버)

```bash
gobuster dns -d $SCOPE_DOMAIN -w subdomains-wordlist.txt -o gobuster_dns.txt
```
CT 로그는 발급된 인증서 기준이라, 내부용 서브도메인(사설 인증서 쓰거나 HTTP만 여는 경우)은 안 잡힘 — DNS 브루트포스가 이걸 보완.

## IP 대역 확인 (ASN 기반)

```bash
# 대상 조직의 ASN 확인
whois -h whois.radb.net -- '-i origin AS<번호>' | grep -Eo "([0-9.]+){4}/[0-9]+"

# 또는 IP로 역질의
curl -s "https://api.bgpview.io/ip/${TARGET_IP}"
```
CDN(Cloudflare 등) 뒤에 숨은 경우 서브도메인 스캔만으론 원본 IP 확인 안 됨 — 별도로 `references/cdn-origin-discovery.md` 필요 시 참고 (히스토리 DNS 레코드, 메일서버 SPF 레코드에서 원본 IP 유출 확인하는 방식).

## 정리 원칙

- 스코프 문서와 대조해서 **스코프 밖 자산은 별도 목록으로 분리, 절대 스캔 진행하지 말 것** (3rd party SaaS, 다른 조직 소유 등)
- 이 단계 결과(`alive_hosts.txt`)가 이후 모든 단계의 입력이 되므로, 여기서 놓친 자산은 전체 평가에서 영구히 누락됨 — 시간 아깝다고 소스 하나만 쓰고 넘어가지 말 것
