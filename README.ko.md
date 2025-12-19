# Code Please

[English](README.md) | 한국어

자동 포맷팅과 LSP 진단 기능을 갖춘 AI 코딩 지원 CLI 및 Claude Code 플러그인입니다.

## 주요 기능

- **자동 포맷팅 훅** - Claude Code 편집 후 자동으로 파일 포맷팅
- **LSP 진단** - AI 코딩 세션을 위한 실시간 타입 체크 피드백
- **다중 언어 지원** - TypeScript, Python, Go, Rust 등

## 설치

```bash
npm install -g @pleaseai/code
# 또는
bun add -g @pleaseai/code
```

## 빠른 시작

### Claude Code 훅 설정

`.claude/settings.json`에 다음을 추가하세요:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx @pleaseai/code format --stdin"
          },
          {
            "type": "command",
            "command": "npx @pleaseai/code lsp --stdin"
          }
        ]
      }
    ]
  }
}
```

또는 예제 훅 파일을 복사하세요:

```bash
cp node_modules/@pleaseai/code/hooks/hooks.json .claude/
```

### CLI 사용법

```bash
# 파일 포맷팅
code format src/index.ts

# LSP 진단 확인
code lsp src/index.ts
```

## 설정

프로젝트 루트에 `dora.json` 또는 `opencode.json`을 생성하세요:

```json
{
  "formatter": {
    "biome": {
      "extensions": [".ts", ".tsx", ".js", ".jsx", ".json"]
    },
    "prettier": {
      "disabled": true
    },
    "custom": {
      "command": ["my-formatter", "$FILE"],
      "extensions": [".xyz"]
    }
  }
}
```

### 모든 포매터 비활성화

```json
{
  "formatter": false
}
```

## 지원 언어

### LSP 진단

| 언어                  | 서버                       | 자동 감지 기준                   |
|-----------------------|----------------------------|----------------------------------|
| TypeScript/JavaScript | typescript-language-server | package.json, bun.lock           |
| TypeScript/JavaScript | oxlint                     | .oxlintrc.json, package.json     |
| Deno                  | deno lsp                   | deno.json                        |
| Python                | pyright                    | pyproject.toml, requirements.txt |
| Go                    | gopls                      | go.mod                           |
| Rust                  | rust-analyzer              | Cargo.toml                       |
| Kotlin                | JetBrains Kotlin LSP       | build.gradle.kts, pom.xml        |
| Dart                  | dart language-server       | pubspec.yaml                     |
| Prisma                | @prisma/language-server    | schema.prisma                    |
| Vue                   | @vue/language-server       | package.json (vue 포함)          |

### 포매터

biome, prettier, gofmt, mix, zig fmt, clang-format, ktlint, ruff, air (R), uv format, rubocop, standardrb, htmlbeautifier, dart, ocamlformat, terraform, latexindent, gleam, prisma

## MCP 서버

(준비 중)

## 환경 변수

| 변수                 | 설명              | 기본값 |
|----------------------|-------------------|--------|
| `CODE_PROJECT_PATH`  | 프로젝트 디렉토리 | cwd    |
| `CLAUDE_PROJECT_DIR` | 훅 모드에서 사용  | -      |

## 개발

```bash
# 의존성 설치
bun install

# 테스트 실행
bun run test

# 타입 체크
bun run typecheck

# 빌드
bun run build
```

## 라이선스

MIT
