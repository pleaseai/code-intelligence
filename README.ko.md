# Code Please

[English](README.md) | 한국어

Claude Code용 자동 포맷팅 및 LSP 진단 플러그인. AI 코딩 세션에서 실시간 타입 체크 피드백과 자동 코드 포맷팅을 제공합니다.

## 주요 기능

- **자동 포맷팅 훅** — Claude Code 편집 후 자동으로 파일 포맷팅 (35+ 포매터)
- **LSP 진단** — 실시간 타입 에러와 경고를 Claude 컨텍스트로 피드백
- **30+ 언어 서버** — TypeScript, Python, Go, Rust, Kotlin, Dart 등
- **제로 설정** — 프로젝트 파일에서 언어 서버 자동 감지

## 플러그인 설치 (Claude Code)

### Step 1: 마켓플레이스 추가

```bash
/plugin marketplace add pleaseai/code-intelligence
```

### Step 2: 플러그인 설치

```bash
# 코어 플러그인 설치 (자동 포맷팅 훅 + LSP 진단)
/plugin install code-please@code-intelligence

# project 스코프로 설치 (팀과 공유, .claude/settings.json에 기록)
/plugin install code-please@code-intelligence --scope project
```

`code-please` 플러그인이 설치되며 다음을 제공합니다:
- Write/Edit 시 자동 포맷팅 PostToolUse 훅
- Claude 컨텍스트로 피드백되는 LSP 진단

### 언어별 LSP 플러그인 설치

필요한 언어 서버만 선택 설치하세요:

```bash
# TypeScript/JavaScript
/plugin install typescript-lsp@code-intelligence

# Python
/plugin install pyright-lsp@code-intelligence

# Go
/plugin install gopls-lsp@code-intelligence

# Rust
/plugin install rust-analyzer-lsp@code-intelligence
```

> **참고:** 언어 서버 바이너리는 첫 세션 시작 시 `npm install`로 자동 설치됩니다.
> 별도의 수동 설치가 필요하지 않습니다.

### 플러그인 관리

```bash
# 마켓플레이스 및 플러그인 업데이트
/plugin marketplace update code-intelligence

# 제거하지 않고 비활성화
/plugin disable code-please@code-intelligence

# 다시 활성화
/plugin enable code-please@code-intelligence

# 제거
/plugin uninstall code-please@code-intelligence

# 변경 후 재로드 (재시작 불필요)
/reload-plugins
```

### 사용 가능한 LSP 플러그인

| 플러그인 | 언어 | 서버 |
|----------|------|------|
| `typescript-lsp` | TypeScript/JavaScript | typescript-language-server |
| `pyright-lsp` | Python | pyright |
| `gopls-lsp` | Go | gopls |
| `rust-analyzer-lsp` | Rust | rust-analyzer |
| `kotlin-lsp` | Kotlin | JetBrains Kotlin LSP |
| `dart-lsp` | Dart | dart language-server |
| `vue-lsp` | Vue | @vue/language-server |
| `svelte-lsp` | Svelte | svelte-language-server |
| `astro-lsp` | Astro | @astrojs/language-server |
| `deno-lsp` | Deno | deno lsp |
| `biome-lsp` | JS/TS (린터) | biome |
| `oxlint-lsp` | JS/TS (린터) | oxlint |
| `eslint-lsp` | JS/TS (린터) | eslint |
| `prisma-lsp` | Prisma | @prisma/language-server |
| `graphql-lsp` | GraphQL | graphql-language-service-cli |
| `yaml-lsp` | YAML | yaml-language-server |
| `bash-lsp` | Bash/Shell | bash-language-server |
| `dockerfile-lsp` | Dockerfile | dockerfile-language-server |
| `php-lsp` | PHP | intelephense |
| `jdtls-lsp` | Java | Eclipse JDTLS |
| `clangd-lsp` | C/C++ | clangd |
| `csharp-lsp` | C# | OmniSharp |
| `fsharp-lsp` | F# | fsautocomplete |
| `swift-lsp` | Swift | SourceKit-LSP |
| `rubocop-lsp` | Ruby (린터) | rubocop |
| `elixir-lsp` | Elixir | elixir-ls |
| `lua-lsp` | Lua | lua-language-server |
| `ocaml-lsp` | OCaml | ocaml-lsp |
| `terraform-lsp` | Terraform | terraform-ls |
| `texlab-lsp` | LaTeX | TexLab |
| `gleam-lsp` | Gleam | gleam |
| `zls-lsp` | Zig | zls |

## CLI 사용법

```bash
# 전역 설치
npm install -g @pleaseai/code

# 파일 포맷팅
code format src/index.ts

# LSP 진단 확인
code lsp src/index.ts

# 도구 확인 및 설치
code setup
```

## 설정

프로젝트 루트에 `.please/config.yml`을 생성하세요:

```yaml
# 포매터 설정
formatter:
  biome:
    command: [biome, format, --write, $FILE]
    extensions: [.ts, .tsx, .js, .jsx]
  prettier:
    disabled: true # 내장 포매터 비활성화
  custom:
    command: [my-formatter, $FILE]
    extensions: [.xyz]

# LSP 설정
lsp:
  typescript:
    enabled: true
  pyright:
    root: ./backend # 커스텀 루트 경로
  vue:
    enabled: false # 특정 서버 비활성화
```

`formatter: false` 또는 `lsp: false`로 전체 비활성화할 수 있습니다.

## 내장 포매터

biome, prettier, gofmt, mix (Elixir), zig fmt, clang-format, ktlint (Kotlin), ruff, air (R), uv format, rubocop, standardrb, htmlbeautifier, dart, ocamlformat, terraform, latexindent, gleam, prisma

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `CODE_PROJECT_PATH` | 프로젝트 디렉토리 | cwd |
| `CLAUDE_PROJECT_DIR` | 훅 모드에서 사용 | - |

## 개발

```bash
bun install       # 의존성 설치
bun run test      # 테스트 실행
bun run typecheck # 타입 체크
bun run build     # 빌드
```

## 라이선스

MIT
