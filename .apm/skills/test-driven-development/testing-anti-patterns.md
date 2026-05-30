# テストのアンチパターン

**このリファレンスを読み込むタイミング:** テストの記述・変更、mock の追加、本番コードにテスト専用メソッドを追加したくなったとき。

## 概要

テストは mock の挙動ではなく、実挙動を検証しなければならない。mock は隔離の手段であり、テスト対象ではない。

**中核原則:** コードが何をするかをテストする。mock が何をするかではない。

**厳格な TDD がこれらのアンチパターンを防ぐ。**

## 鉄則

```
1. mock の挙動を NEVER テストする
2. 本番クラスにテスト専用メソッドを NEVER 追加する
3. 依存を理解せず mock しない
```

## アンチパターン 1: mock 挙動のテスト

**違反:**
```typescript
// ❌ BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**なぜ間違い:**
- mock が動くことを検証しているだけで、コンポーネントは検証していない
- mock があれば通り、なければ失敗
- 実挙動について何も教えてくれない

**human partner の指摘:** 「mock の挙動をテストしていないか？」

**修正:**
```typescript
// ✅ GOOD: Test real component or don't mock it
test('renders sidebar', () => {
  render(<Page />);  // Don't mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});

// OR if sidebar must be mocked for isolation:
// Don't assert on the mock - test Page's behavior with sidebar present
```

### ゲート関数

```
mock 要素に assert する前:
  自問: 「実コンポーネントの挙動をテストしているか、mock の存在だけか？」

  IF mock の存在をテストしている:
    STOP — assert を削除するかコンポーネントの mock を外す

  代わりに実挙動をテスト
```

## アンチパターン 2: 本番コードのテスト専用メソッド

**違反:**
```typescript
// ❌ BAD: destroy() only used in tests
class Session {
  async destroy() {  // Looks like production API!
    await this._workspaceManager?.destroyWorkspace(this.id);
    // ... cleanup
  }
}

// In tests
afterEach(() => session.destroy());
```

**なぜ間違い:**
- 本番クラスがテスト専用コードで汚染される
- 本番で誤って呼ばれると危険
- YAGNI と関心の分離に反する
- オブジェクトライフサイクルとエンティティライフサイクルを混同

**修正:**
```typescript
// ✅ GOOD: Test utilities handle test cleanup
// Session has no destroy() - it's stateless in production

// In test-utils/
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// In tests
afterEach(() => cleanupSession(session));
```

### ゲート関数

```
本番クラスにメソッドを追加する前:
  自問: 「テストでのみ使うか？」

  IF yes:
    STOP — 追加しない
    test utilities に置く

  自問: 「このクラスがこのリソースのライフサイクルを所有するか？」

  IF no:
    STOP — このメソッドのクラスが間違っている
```

## アンチパターン 3: 理解なしの mock

**違反:**
```typescript
// ❌ BAD: Mock breaks test logic
test('detects duplicate server', () => {
  // Mock prevents config write that test depends on!
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // Should throw - but won't!
});
```

**なぜ間違い:**
- mock したメソッドにテストが依存する副作用（config 書き込み）があった
- 「安全のため」の過剰 mock が実挙動を壊す
- 間違った理由で通るか、謎の失敗になる

**修正:**
```typescript
// ✅ GOOD: Mock at correct level
test('detects duplicate server', () => {
  // Mock the slow part, preserve behavior test needs
  vi.mock('MCPServerManager'); // Just mock slow server startup

  await addServer(config);  // Config written
  await addServer(config);  // Duplicate detected ✓
});
```

### ゲート関数

```
メソッドを mock する前:
  STOP — まだ mock しない

  1. 自問: 「実メソッドにはどんな副作用があるか？」
  2. 自問: 「このテストはその副作用のいずれかに依存するか？」
  3. 自問: 「このテストが必要とすることを完全に理解しているか？」

  IF 副作用に依存:
    より低いレベル（実際の遅い/外部操作）で mock
    または必要な挙動を保つ test double
    テストが依存する高レベルメソッドは NOT

  IF 依存が不明:
    まず実装でテストを実行
    実際に何が必要か観察
    その後、正しいレベルで最小 mock を追加

  危険信号:
    - 「安全のため mock しよう」
    - 「遅いかも、mock した方がいい」
    - 依存チェーンを理解せず mock
```

## アンチパターン 4: 不完全な mock

**違反:**
```typescript
// ❌ BAD: Partial mock - only fields you think you need
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // Missing: metadata that downstream code uses
};

// Later: breaks when code accesses response.metadata.requestId
```

**なぜ間違い:**
- **部分 mock は構造的前提を隠す** — 知っているフィールドだけ mock
- **下流コードが含めなかったフィールドに依存するかも** — サイレント失敗
- **テストは通るが統合は失敗** — mock 不完全、実 API は完全
- **誤った自信** — テストは実挙動について何も証明しない

**鉄則:** 即座のテストで使うフィールドだけでなく、現実と同じ完全なデータ構造を mock する。

**修正:**
```typescript
// ✅ GOOD: Mirror real API completeness
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // All fields real API returns
};
```

### ゲート関数

```
mock レスポンスを作る前:
  確認: 「実 API レスポンスにはどんなフィールドがあるか？」

  アクション:
    1. ドキュメント/例から実 API レスポンスを調べる
    2. 下流が消費しうる ALL フィールドを含める
    3. mock が実レスポンス schema と完全に一致することを検証

  重要:
    mock を作るなら ENTIRE 構造を理解している必要がある
    部分 mock は省略フィールドに依存するコードでサイレント失敗

  不明なら: ドキュメント化された全フィールドを含める
```

## アンチパターン 5: 後付けの統合テスト

**違反:**
```
✅ Implementation complete
❌ No tests written
"Ready for testing"
```

**なぜ間違い:**
- テストは実装の一部であり、任意の後処理ではない
- TDD なら検知していた
- テストなしに完了と言えない

**修正:**
```
TDD サイクル:
1. 失敗テストを書く
2. 通す実装
3. リファクタ
4. その後に完了と言う
```

## mock が複雑すぎるとき

**警告サイン:**
- mock セットアップがテストロジックより長い
- テストを通すために全部 mock
- mock に実コンポーネントのメソッドが欠けている
- mock 変更でテストが壊れる

**human partner の質問:** 「ここで mock が必要か？」

**検討:** 実コンポーネントの統合テストの方が複雑 mock より単純なことが多い

## TDD がこれらを防ぐ理由

**TDD が役立つ理由:**
1. **先にテスト** → 実際に何をテストするか考えさせる
2. **失敗を見る** → 実コードに対する失敗を確認、mock ではない
3. **最小実装** → テスト専用メソッドの混入を防ぐ
4. **実依存** → mock 前にテストが本当に必要とすることを見る

**mock 挙動をテストしているなら TDD 違反** — 実コードに対する失敗を見ずに mock を追加した。

## クイックリファレンス

| アンチパターン | 修正 |
|--------------|-----|
| mock 要素に assert | 実コンポーネントをテストするか mock を外す |
| 本番のテスト専用メソッド | test utilities に移す |
| 理解なしの mock | 先に依存を理解、最小限 mock |
| 不完全 mock | 実 API を完全に反映 |
| 後付けテスト | TDD — テストファースト |
| 過剰に複雑な mock | 統合テストを検討 |

## 危険信号

- `*-mock` test ID をチェックする assertion
- テストファイルでのみ呼ばれるメソッド
- mock セットアップがテストの 50% 超
- mock を外すとテスト失敗
- なぜ mock が必要か説明できない
- 「安全のため」mock

## 結論

**mock は隔離のツールであり、テスト対象ではない。**

TDD で mock 挙動をテストしていると分かったら、間違っている。

修正: 実挙動をテストするか、なぜ mock しているか問い直す。
