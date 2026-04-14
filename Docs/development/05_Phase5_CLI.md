# Phase 5: CLIフロントエンド（エントリーポイント）の作成

## 概要

これまで作成してきた「API取得(Phase 2)」「マスキング(Phase 3)」「LLM推論ループ(Phase 4)」のすべてを統合し、ユーザーがターミナルから直接実行できるCLIアプリとしての入り口（エントリーポイント）を `src/cli/index.ts` に作成します。

これが本プロジェクトの**最後のコーディング作業**となります！

## 作業手順

### 1. エントリーポイントの実装

対象ファイル: `src/cli/index.ts`
（フォルダやファイルが存在しない場合は、`src` の下に `cli` フォルダを作り、新規作成してください）

以下のコードを実装してください。実行時のターミナル引数（例: `bun run start "Discord落ちてる？"`）を受け取ってチェックし、エラーがなければ `agent.ts` を呼び出すだけのシンプルなUI層です。

```typescript
import { runAgent } from "../core/agent.js";
// ※ Bunでは設定不要ですが、環境変数(GEMINI_API_KEY)が存在する前提で動きます

async function main() {
  // ターミナルから渡された引数を受け取る (プロセス引数の3番目以降を結合)
  const args = process.argv.slice(2);
  const prompt = args.join(" ");

  // 万が一、引数なしで実行された場合のフェイルセーフ
  if (!prompt) {
    console.error("❌ エラー: 障害状況を調査したいサービスを引数で渡してください。");
    console.error("💡 例: bun run src/cli/index.ts \\"DiscordとGitHubの状況を調査して\\"");
    process.exit(1);
  }

  try {
    // Phase 4 で作成した心臓部（エージェント）を呼び出す
    await runAgent(prompt);
  } catch (error) {
    console.error("\\n❌ 予期せぬシステムエラーが発生しました:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1); // 異常終了ステータスで抜ける
  }
}

// プログラムの開始！
main();
```

> **なぜこれが必要か（シニア視点での解説）:**
>
> - **アーキテクチャの関心の分離**（UI層とドメインロジック層の分離）です。ここ（CLI層）には「ユーザーの入力解釈」や「エラー表示」などのUI周りだけを記述し、実際のAIの頭脳は `core/agent.ts` に分離することで、もし将来「CLIをやめてSlackボットに変えよう」となった際にも UI層を差し替えるだけで済み、極めて高い保守性を発揮します。

### 2. 環境変数 (.env) の用意

AIを動かすためのAPIキーを設定します。
プロジェクトルート（`oncall-cli-charrenge` フォルダの中）に `.env` という名前のファイルを作成し、以下の書式でご自身の Gemini APIキー を設定してください。

```env
GEMINI_API_KEY="AIzaSy...（取得したAPIキー）"
```

*(※なお、初期要件で用意した `.gitignore` により `.env` はコミット対象から外れているため、GitHub等にキーが漏洩する心配はありません。安全に設定してください。)*

---
**作業が完了しましたら、「Phase 5完了！テスト準備OK」とお伝えください！**
これで全フェーズのコードが完成となります。最後に総仕上げとして、実際のターミナルからコマンドを打って動作テスト（E2E）を行っていただきます！
