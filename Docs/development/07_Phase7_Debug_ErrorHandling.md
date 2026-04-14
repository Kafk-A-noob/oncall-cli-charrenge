# Phase 7: デバッグモード（--debug）とエラーハンドリング・リトライ戦略の追加実装

## 概要

本フェーズでは、課題の歓迎要件である以下2点を実装します。

* **エージェントの思考プロセスのログ出力・可視化** → `--debug` フラグの追加
* **エラーハンドリング・リトライ戦略** → タイムアウト + 1回リトライの導入

いずれもコアロジックの構造を壊さず、最小限の変更で追加できる設計です。

---

## 1. デバッグモード（--debug）の実装

### 1-1. CLI層の引数パース修正

**対象ファイル:** `src/cli/index.ts`
**修正箇所:** L6〜L7 付近の引数取得部分
**なぜ必要か:** 現在は `process.argv.slice(2)` を全てプロンプトとして結合しているが、`--debug` フラグを分離して判定する必要がある。

```typescript
// === 変更前 ===
const args = process.argv.slice(2);
const prompt = args.join(" ");

// === 変更後 ===
const args = process.argv.slice(2);
const debugMode = args.includes("--debug");
// --debug を除外した残りをプロンプトとして結合
const prompt = args.filter(a => a !== "--debug").join(" ");
```

### 1-2. デバッグフラグを Agent に渡す

**対象ファイル:** `src/cli/index.ts`
**修正箇所:** L38 付近の `runAgent` 呼び出し部分
**なぜ必要か:** Agent側でデバッグ出力を制御するため、フラグを引数として渡す。

```typescript
// === 変更前 ===
await runAgent(prompt);

// === 変更後 ===
await runAgent(prompt, debugMode);
```

### 1-3. Agent 側でデバッグログを出力

**対象ファイル:** `src/core/agent.ts`
**修正箇所:** `runAgent` 関数のシグネチャと Function Calling ループ内
**なぜ必要か:** 裏側でLLMが「どのツールを」「どんな引数で」呼んだか、マスキング前後でデータがどう変わったかを可視化する。デモ時に通常モードとの切り替えを見せることで、歓迎要件「思考プロセスの可視化」を満たす。

```typescript
// === 変更前 ===
export async function runAgent(userPrompt: string) {

// === 変更後 ===
export async function runAgent(userPrompt: string, debug: boolean = false) {
```

Function Calling ループ内（`for (const call of response.functionCalls)` の中）に以下のデバッグ出力を追加:

```typescript
if (call.name === "fetchServiceStatus") {
  const serviceName = (call.args as any)?.serviceName as string;
  console.log(`[実行] ${serviceName} のステータスを取得中...`);

  // --- ここから追加 ---
  if (debug) {
    console.log("\n--- [DEBUG] Function Calling 詳細 ---");
    console.log(`  ツール名: ${call.name}`);
    console.log(`  引数(生): ${JSON.stringify(call.args)}`);
  }
  // --- ここまで追加 ---

  const rawResult = await fetchServiceStatus(serviceName);

  // --- ここから追加 ---
  if (debug) {
    console.log(`  API応答(生): ${rawResult}`);
  }
  // --- ここまで追加 ---

  const safeResult = maskSensitiveData(rawResult);

  // --- ここから追加 ---
  if (debug) {
    console.log(`  マスク済み: ${safeResult}`);
    console.log("--- [DEBUG] END ---\n");
  }
  // --- ここまで追加 ---

  response = await chat.sendMessage({
    message: [{
      functionResponse: {
        name: call.name,
        response: { result: safeResult }
      }
    }]
  });
}
```

### 1-4. ヘルプ表示の更新

**対象ファイル:** `src/cli/index.ts`
**修正箇所:** L13〜L25 の console.log 内
**なぜ必要か:** `--debug` オプションが存在することをユーザーに知らせる。

ヘルプ表示の末尾（`実行例:` の後など）に以下を追記:

```text
      オプション:
      --debug  AIの推論プロセス(Function Calling)の詳細を表示
```

---

## 2. エラーハンドリングとリトライ戦略の実装

### 2-1. タイムアウト付きfetchとリトライの導入

**対象ファイル:** `src/tools/index.ts`
**修正箇所:** `fetchServiceStatus` 関数内の `fetch(url)` 呼び出し部分
**なぜ必要か:** 障害発生中にStatus API自体が遅延・ダウンしている可能性がある。そのままfetchを叩くとCLI全体がフリーズ（ハング）する。タイムアウトで切り、1回だけリトライすることで「リトライ戦略」という歓迎要件を満たす。

まず、ファイルの先頭付近（`import { z } from "zod";` の後など）にリトライ付きfetch関数を追加:

```typescript
/**
 * タイムアウト制御 + 1回リトライ付き fetch
 * 障害時のAPI遅延によるCLIフリーズを防止する
 */
async function fetchWithRetry(url: string, timeoutMs: number = 5000): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response;
      // 5xx系はリトライ対象
      if (response.status >= 500 && attempt < 2) {
        console.log(`  [リトライ] サーバーエラー(${response.status})、再取得を試みます...`);
        continue;
      }
      throw new Error(`HTTPエラー: ステータス ${response.status}`);
    } catch (error) {
      if (attempt < 2 && error instanceof Error && error.name === "TimeoutError") {
        console.log(`  [リトライ] タイムアウト発生、再取得を試みます...`);
        continue;
      }
      throw error;
    }
  }
  // TypeScript用: ここには到達しないが型推論のために必要
  throw new Error("リトライ上限に到達しました");
}
```

### 2-2. 既存のfetch呼び出しを差し替え

**対象ファイル:** `src/tools/index.ts`
**修正箇所:** `fetchServiceStatus` 関数内の `fetch(url)` と `response.ok` チェック
**なぜ必要か:** 作成した `fetchWithRetry` に差し替えることで、タイムアウトとリトライが自動適用される。

```typescript
// === 変更前 ===
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`HTTPエラー: ステータス ${response.status}`);
}

// === 変更後（2行に簡素化）===
const response = await fetchWithRetry(url);
```

`fetchWithRetry` 内部で `response.ok` のチェックとエラー送出を既に行っているため、呼び出し元の ok チェックは不要になる。

### 2-3. catchブロックのエラー出力を強化

**対象ファイル:** `src/tools/index.ts`
**修正箇所:** `fetchServiceStatus` 関数内の catch ブロック（L73〜L78付近）
**なぜ必要か:** 「システム側の障害かAPI側の障害かを切り分けて出力する」ことで、デモ時に「エラーハンドリングが単なる try-catch ではなく、障害切り分けまで考慮している」とアピールできる。

```typescript
// === 変更前 ===
} catch (error) {
  return JSON.stringify({
    error: "ステータスの取得に失敗しました",
    details: error instanceof Error ? error.message : String(error),
  });
}

// === 変更後 ===
} catch (error) {
  const isTimeout = error instanceof Error && error.name === "TimeoutError";
  const isAbort = error instanceof Error && error.name === "AbortError";
  return JSON.stringify({
    error: "ステータスの取得に失敗しました",
    cause: isTimeout || isAbort
      ? "API側の応答遅延またはダウン（タイムアウト）"
      : "システム側エラー（ネットワーク不通、DNS解決失敗等）",
    details: error instanceof Error ? error.message : String(error),
  });
}
```

---

## 3. 実装後の動作確認

### 通常モードでの実行（変化なし）

```bash
bun run start "Discordの状況は？"
```

出力に変化がないことを確認（リグレッションなし）。

### デバッグモードでの実行

```bash
bun run start --debug "GitHubの状況は？"
```

期待される追加出力例:

```text
[思考中...] 状況を確認しています...
[実行] github のステータスを取得中...

--- [DEBUG] Function Calling 詳細 ---
  ツール名: fetchServiceStatus
  引数(生): {"serviceName":"github"}
  API応答(生): {"service":"GitHub","status":"All Systems Operational","indicator":"none"}
  マスク済み: {"service":"GitHub","status":"All Systems Operational","indicator":"none"}
--- [DEBUG] END ---

 【レポート】
GitHubはすべて正常に稼働しています。
```

### リトライの動作確認（任意）

タイムアウトを極端に短く（例: `timeoutMs: 1`）設定して実行し、`[リトライ]` のログが出力されることを確認する。確認後は必ず元の値（5000）に戻すこと。

---

## 4. README への追記事項

実装完了後、README セクション3「設計意図（工夫した点）」に以下の項目を追加する:

```markdown
4. **思考プロセスの可視化とエラーハンドリング**
   `--debug` フラグを付与することで、AIがどのツールをどんな引数で呼び出したか、マスキング前後のデータがどう変化したかを確認できます。また、外部API通信にはタイムアウト制御と1回リトライの戦略を導入し、障害時のAPI遅延によるツール全体のフリーズを防止しています。
```

セクション4のコマンド例にもデバッグモードの使い方を追記:

```markdown
# デバッグモード（AIの推論プロセスを可視化）
./oncall --debug "GitHubのステータスを教えて"
```

---

## 5. バイナリの再ビルド

コード修正後、提出用バイナリを必ず再生成すること:

```bash
bun build --compile src/cli/index.ts --outfile oncall
```
