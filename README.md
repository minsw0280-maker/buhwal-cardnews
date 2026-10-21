# 부활수업 카드뉴스 공방

사진·큰 제목·본문으로 인스타그램 4:5(1080×1350) 카드뉴스를 만드는 사이트입니다.

- 직접 입력: 사진 올리기, 머리말, 큰 제목, 본문 (`*단어*`로 강조)
- AI 글쓰기: 주제만 넣으면 컷 수에 맞춰 원고 작성 (Claude API)
- 힉스필드 이미지: 카드별 프롬프트로 배경 사진 생성 → 카드에 자동으로 들어감 (Higgsfield SOUL V2)
- 표지 스타일 3종 (매거진 / 가운데 정렬 / 액자형), 1~10컷
- 카드별 PNG 저장, 전체 ZIP 저장

## Render에 올리기

1. 이 폴더를 GitHub 저장소로 올립니다.
2. Render → **New → Web Service** → 저장소 선택
   - Runtime: **Node**
   - Build Command: `npm install` (설치할 패키지는 없어요)
   - Start Command: `npm start`
3. **Environment**에 아래 값을 넣습니다.

| 이름 | 값 | 필수 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키 (console.anthropic.com) | AI 글쓰기에 필요 |
| `HF_API_KEY_ID` | 힉스필드 API Key ID (console.higgsfield.ai) | 이미지 생성에 필요 |
| `HF_API_KEY_SECRET` | 힉스필드 API Key Secret | 이미지 생성에 필요 |
| `ACCESS_CODE` | 아무 비밀 코드 (예: `buhwal2026`) | 강력 추천 |

`ACCESS_CODE`를 넣으면 코드를 아는 사람만 AI 글쓰기·이미지 생성을 쓸 수 있어요. 넣지 않으면 주소를 아는 누구나 내 크레딧을 쓸 수 있습니다.

## 내 컴퓨터에서 실행

```bash
npm install
ANTHROPIC_API_KEY=... HF_API_KEY_ID=... HF_API_KEY_SECRET=... npm start
# http://localhost:3000
```

## 참고

- 힉스필드 API에는 4:5 비율이 없어서 3:4(1080p)로 만든 뒤 카드에 맞춰 잘라 씁니다. 위아래 위치는 슬라이더로 조절하세요.
- 작업 내용(글·사진)은 각자의 브라우저에 자동 저장됩니다.
- 기본 AI 모델은 `claude-sonnet-5-5`이며, 바꾸려면 `CLAUDE_MODEL` 환경변수를 넣으세요.
