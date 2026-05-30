# 多層防御（defense-in-depth）validation

## 概要

無効データが原因のバグを修正するとき、1 箇所の validation で十分に感じる。しかしその単一チェックは別コードパス、リファクタ、mock で bypass されうる。

**中核原則:** データが通過する **すべてのレイヤー** で validation。バグを構造的に不可能に。

## なぜ複数レイヤー

単一 validation: 「バグを直した」
複数レイヤー: 「バグを不可能にした」

各レイヤーは異なるケースを捕まえる:
- エントリ validation は大半のバグを捕まえる
- ビジネスロジックはエッジケースを捕まえる
- 環境ガードは文脈固有の危険を防ぐ
- debug logging は他レイヤー失敗時に助ける

## 4 レイヤー

### Layer 1: エントリポイント validation
**目的:** API 境界で明らかに無効な入力を拒否

```typescript
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory || workingDirectory.trim() === '') {
    throw new Error('workingDirectory cannot be empty');
  }
  if (!existsSync(workingDirectory)) {
    throw new Error(`workingDirectory does not exist: ${workingDirectory}`);
  }
  if (!statSync(workingDirectory).isDirectory()) {
    throw new Error(`workingDirectory is not a directory: ${workingDirectory}`);
  }
  // ... proceed
}
```

### Layer 2: ビジネスロジック validation
**目的:** この操作にデータが意味をなすことを保証

```typescript
function initializeWorkspace(projectDir: string, sessionId: string) {
  if (!projectDir) {
    throw new Error('projectDir required for workspace initialization');
  }
  // ... proceed
}
```

### Layer 3: 環境ガード
**目的:** 特定文脈での危険操作を防ぐ

```typescript
async function gitInit(directory: string) {
  // In tests, refuse git init outside temp directories
  if (process.env.NODE_ENV === 'test') {
    const normalized = normalize(resolve(directory));
    const tmpDir = normalize(resolve(tmpdir()));

    if (!normalized.startsWith(tmpDir)) {
      throw new Error(
        `Refusing git init outside temp dir during tests: ${directory}`
      );
    }
  }
  // ... proceed
}
```

### Layer 4: debug instrumentation
**目的:** フォレンジック用コンテキストをキャプチャ

```typescript
async function gitInit(directory: string) {
  const stack = new Error().stack;
  logger.debug('About to git init', {
    directory,
    cwd: process.cwd(),
    stack,
  });
  // ... proceed
}
```

## パターンの適用

バグを見つけたら:

1. **データフローをトレース** — 悪い値の発生源は？どこで使われる？
2. **すべてのチェックポイントをマップ** — データが通過する各点を列挙
3. **各レイヤーで validation 追加** — エントリ、ビジネス、環境、debug
4. **各レイヤーをテスト** — layer 1 を bypass して layer 2 が捕まえるか試す

## セッションからの例

バグ: 空 `projectDir` がソースコードで `git init` を引き起こした

**データフロー:**
1. テストセットアップ → 空文字列
2. `Project.create(name, '')`
3. `WorkspaceManager.createWorkspace('')`
4. `git init` が `process.cwd()` で実行

**4 レイヤー追加:**
- Layer 1: `Project.create()` が空/存在/書き込み可を検証
- Layer 2: `WorkspaceManager` が projectDir 非空を検証
- Layer 3: `WorktreeManager` がテスト中 tmpdir 外 git init を拒否
- Layer 4: git init 前のスタックトレース logging

**結果:** 1847 テストすべて通過、バグ再現不可能

## 重要な洞察

4 レイヤーすべてが必要だった。テスト中、各レイヤーが他が見逃したバグを捕まえた:
- 異なるコードパスがエントリ validation を bypass
- mock がビジネスロジックチェックを bypass
- 異なるプラットフォームのエッジケースに環境ガードが必要
- debug logging が構造的誤用を特定

**1 つの validation 点で止まらない。** すべてのレイヤーにチェックを追加。
