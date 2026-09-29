# 클라우드 자산 탐지 (S3/Azure Blob/GCS 등)

## 원칙 — 추측하기 전에 이미 존재하는 증거부터 확인

`asset-discovery.md`에서 subfinder/crt.sh로 서브도메인을 이미 확보했다면, 브루트포스로 버킷 이름을 추측하기 전에 **그 서브도메인들의 CNAME 레코드를 먼저 확인**할 것. 회사가 실제로 어느 클라우드를 쓰는지, 버킷 이름이 뭔지가 이미 DNS에 기록되어 있는 경우가 많음 — subfinder가 CT 로그를 뒤지는 것과 같은 원리(추측 대신 이미 있는 기록을 찾는 것).

```bash
# 1단계에서 확보한 서브도메인 전체에 대해 CNAME 체인 확인
for sub in $(cat all_subdomains.txt); do
    echo -n "$sub -> "
    dig CNAME "$sub" +short
done > cname_records.txt

# 클라우드 스토리지로 향하는 CNAME만 필터링
grep -iE "s3.amazonaws.com|s3-website|blob.core.windows.net|storage.googleapis.com|cloudfront.net" cname_records.txt
```

**이 결과가 나오면 버킷 이름이 이미 확정됨** — 예를 들어 `static.target.co.kr`이 `target-cdn-assets.s3.amazonaws.com`으로 CNAME 걸려있으면, 버킷명은 `target-cdn-assets`. 추측할 필요 없이 바로 접근권한 확인 단계로 넘어감:

```bash
aws s3 ls s3://target-cdn-assets --no-sign-request
```

**CNAME에서 아무 신호도 안 나오면**, 아래 브루트포스 방식으로 넘어가되 — 이 경우 클라우드 자산 자체가 없거나(온프레미스 위주 조직), 있어도 CNAME 안 걸고 직접 프리사인드 URL/API로만 접근하는 구조일 가능성이 있다는 것도 함께 고려. 무작정 대량 브루트포스 돌리기 전에 이 가능성을 먼저 사용자에게 보고하는 게 시간 낭비를 줄임.

또 다른 패시브 신호: httpx `-tech-detect` 결과나 웹페이지 소스에서 직접 노출되는 URL도 확인:
```bash
# 이미 크롤링/퍼징한 페이지 소스에서 클라우드 스토리지 URL 직접 검색
grep -rhoE "[a-zA-Z0-9.-]+\.s3\.amazonaws\.com|[a-zA-Z0-9.-]+\.s3-[a-z0-9-]+\.amazonaws\.com" crawled_pages/ | sort -u
grep -rhoE "[a-zA-Z0-9.-]+\.blob\.core\.windows\.net" crawled_pages/ | sort -u
```
JS 파일이나 이미지 태그에 CDN URL이 하드코딩되어 그대로 버킷명이 노출되는 경우가 실제로 흔함 — 이것도 브루트포스보다 먼저 확인할 가치 있음.

## 브루트포스 (패시브 신호가 없을 때만)

## 버킷 이름 후보 생성

회사명/도메인명 기반으로 흔한 네이밍 패턴 조합:

```bash
# 후보 이름 조합 (회사명, 도메인, 환경명 등 조합)
cat > bucket_candidates.txt << EOF
${COMPANY_NAME}
${COMPANY_NAME}-dev
${COMPANY_NAME}-prod
${COMPANY_NAME}-staging
${COMPANY_NAME}-backup
${COMPANY_NAME}-static
${COMPANY_NAME}-assets
${COMPANY_NAME}-uploads
${COMPANY_NAME}-data
www-${COMPANY_NAME}
EOF
```

## AWS S3 버킷 확인

```bash
# ffuf로 S3 버킷 존재여부 + 권한 확인
ffuf -u https://FUZZ.s3.amazonaws.com -w bucket_candidates.txt -mc 200,403 -o s3_result.json -of json
```
- `200` = 버킷 존재 + 리스팅 가능 (즉시 심각도 높은 발견)
- `403` = 버킷 존재하나 접근 거부 (존재만 확인, 추가로 권한 오설정 있는지 별도 확인 필요 — 특정 객체 경로 직접 접근 시도)
- 응답 없음/`NoSuchBucket` = 해당 이름 버킷 없음

리스팅 가능한 버킷 발견 시:
```bash
aws s3 ls s3://<bucket-name> --no-sign-request
```

## Azure Blob Storage 확인

```bash
ffuf -u https://FUZZ.blob.core.windows.net/ -w bucket_candidates.txt -mc 200,403,400 -o azure_result.json -of json
```
컨테이너명까지 알아야 실제 파일 리스팅 가능한 경우가 많음 — 흔한 컨테이너명(`$root`, `backup`, `static`, `upload`)도 별도 워드리스트로 병행.

## Google Cloud Storage 확인

```bash
ffuf -u https://storage.googleapis.com/FUZZ -w bucket_candidates.txt -mc 200,403 -o gcs_result.json -of json
```

## 클라우드 메타데이터 엔드포인트 (SSRF 연계)

버킷 탐지와는 별개로, 웹 애플리케이션에서 SSRF 취약점 발견 시 클라우드 메타데이터 서버 접근 시도 대상:

| 클라우드 | 메타데이터 엔드포인트 |
|---|---|
| AWS | `http://169.254.169.254/latest/meta-data/` (IMDSv2는 토큰 헤더 필요 — `X-aws-ec2-metadata-token`) |
| Azure | `http://169.254.169.254/metadata/instance?api-version=2021-02-01` (헤더 `Metadata: true` 필요) |
| GCP | `http://metadata.google.internal/computeMetadata/v1/` (헤더 `Metadata-Flavor: Google` 필요) |

이건 자산탐지 단계가 아니라 실제 SSRF 취약점 확인 시점에 쓰는 것 — 여기서는 존재만 기록해두고, 취약점 스킬/수동테스트로 연계.

## 주의사항

- 클라우드 버킷 브루트포스는 대량 요청이 발생하므로 **반드시 스코프에 클라우드 자산 포함 여부 확인 후 진행** (계약서에 도메인만 명시되고 클라우드 자산이 빠져있으면 별도 협의 필요 — AWS/Azure/GCP 소유주가 대상 조직이 아닐 수도 있음)
- 발견된 버킷이 스코프 내 조직 소유인지 반드시 확인(버킷 내용/도메인 연관성 확인) 후 보고
