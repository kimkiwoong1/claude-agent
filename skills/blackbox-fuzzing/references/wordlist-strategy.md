# 워드리스트 전략

무작정 큰 범용 워드리스트로 전체 갈기는 건 시간 낭비 + WAF 탐지 위험만 키움. 타겟 기술스택 확인되면 그에 맞게 좁혀서 시작.

## 우선순위

1. **타겟 기술스택 기반 커스텀 워드리스트** (제일 먼저) — `directory-fuzzing.md`의 국내 WAS/프레임워크별 경로 목록
2. **범용 워드리스트 압축판** (SecLists의 `common.txt`, `raft-small-*` 등) — 빠르게 1차 스캔
3. **범용 워드리스트 전체판** (필요시에만, 시간 많이 걸림) — 1,2에서 놓친 것 커버용

```bash
# SecLists 예시 경로 (설치되어 있다는 전제)
/usr/share/seclists/Discovery/Web-Content/common.txt          # 빠른 1차
/usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt  # 정밀
```

## 타겟 언어/네이밍 특성 반영

한국 기관/기업 사이트는 종종 한글 발음 기반 영문 경로명을 씀 (`gonggo`, `minwon`, `shinchung` 등 — 공고/민원/신청). 범용 워드리스트엔 당연히 없음. 이런 경우:

```bash
# 자산탐지 단계에서 확보한 사이트맵/robots.txt/기존 발견 경로에서 패턴 추출
curl -s https://$TARGET/robots.txt
curl -s https://$TARGET/sitemap.xml

# 발견된 경로에서 반복되는 접두사/네이밍 패턴 뽑아서 커스텀 워드리스트에 추가
```

## 동적 워드리스트 생성

대상 사이트 콘텐츠 자체에서 단어 추출해서 워드리스트 만드는 방법 (CeWL 등):
```bash
cewl https://$TARGET -d 2 -m 5 -w custom_cewl_wordlist.txt
```
사이트 자체 용어(제품명, 부서명, 서비스명)가 숨은 경로/파라미터 이름으로 재사용되는 경우 많아서 의외로 적중률 높음.

## 인증정보 브루트포스용 워드리스트는 별도

로그인폼 등 인증 우회 목적 브루트포스는 이 스킬 범위 밖 — 별도로 신중히 접근할 것 (계정 잠금 정책, rate limit 등 사전 확인 필수, 무분별한 크리덴셜 스터핑은 스코프 협의 필요).

## 워드리스트 관리 원칙

- 프로젝트별로 발견한 패턴을 계속 커스텀 워드리스트에 누적할 것 — 다음 유사 기관/기업 점검 때 재사용 가능한 자산이 됨
- `scripts/wordlists/`에 지금까지 확인된 국내 WAS/프레임워크 패턴을 기본 세트로 넣어둠, 케이스 쌓일 때마다 추가
