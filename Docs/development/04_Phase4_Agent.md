# Phase 4: コアロジック（LLMエージェント）の構築

## 概要

Phase 3 で機密情報のマスキング機能（絶対防衛線）が完成したため、本フェーズではプロジェクトの中核である Gemini API を用いたエージェント推論ロジックを実装します。

要件で定義された `1.1 出力方針（過剰装飾を避け、正確な一次情報をシンプルに出す）` をシステムプロンプトで制御し、ユーザーの指示をもとにツールを呼び出し、レスポンスをマスキングして要約させる「Function Calling ループ」を作成します。

## 作業手順

### 1. Agent 初期化と System Instruction の設定

対象ファイル: `src/core/agent.ts`

LLMの振る舞い（1.1要件）を決定づけるシステム指示書と、モジュールのインポートを記述します。
まずは以下のスニペットを `src/core/agent.ts` にコーディングしてください。

```typescript
import { GoogleGenAI } from '@google/genai';
import { maskSensitiveData } from './masking.js';
// ※ 注: 後ほどここに tools のインポートを追加します。

// SDKの初期化 (環境変数 GEMINI_API_KEY を自動参照します)
const ai = new GoogleGenAI({});

/**
 * 1.1 要件に基づく出力方針（システムプロンプト）
 * 深夜のエンジニア向けに、コピペしやすい生データをシンプルに出力させる
 */
const SYSTEM_INSTRUCTION = `
あなたはインフラ保守運用を支援するシニア・初動対応AIエージェントです。
目的: 深夜に障害アラートで起こされたエンジニアの負担を即座に軽減すること。

【絶対の出力ルール】
- 取得したJSONの一次情報を、ノイズなく極めてシンプルに出力すること。
- 現場によって報告フォーマットが異なるため、Slack用などの特定の過剰装飾（無駄な絵文字、砕けた挨拶、不要なマークダウン装飾）は一切行わないこと。
- コピペして使いやすい「正確な生データ」としての使い勝手を最優先し、異常があればその箇所のみを淡々と明記すること。
`;

/**
 * CLIから呼ばれるエントリーポイント関数
 */
export async function runAgent(userPrompt: string) {
  // UX要件: 思考中ログの出力
  console.log("[思考中...] 状況を確認しています...");
  
  // TODO: 次にここで ai.chats.create() のループ処理（Function Calling）を実装します
}
```

> **なぜこれが必要か:**
>
> - `SYSTEM_INSTRUCTION` によって、LLMが「お喋りなチャットボット」になるのを防ぎ、課題要件である「エンジニア向けのシンプルなコピペ用出力」を強制します。
> - `console.log("[思考中...]")` によって、要件「4.4 起動の手軽さとUX」を満たしています。

---
**【過去のステップ（ベース実装完了の承認）】**
※この時点でユーザーより「ベース完了」の承認をいただきました。以下にその後の手順を追記します。

---

### 2. Function Calling ループの実装

`agent.ts` において、`ai.chats.create` を使用して対話セッションを初期化し、先ほど作成した `tools` をGeminiに連携させます。
以下のコードを参考に、`runAgent` 関数を完成させてください。
（※ファイルの先頭付近に `import { fetchServiceStatus } from '../tools/index.js';` を追加するのをお忘れなく！）

```typescript
// --- 追加・修正するインポート ---
import { fetchServiceStatus } from '../tools/index.js';
// ★ "OBJECT"等の型エラーを防ぐため、Typeモジュールを@google/genaiから追加インポートしておきます
// import { GoogleGenAI, Type } from '@google/genai';

// ... (SYSTEM_INSTRUCTIONの定義等はそのまま残します) ...

export async function runAgent(userPrompt: string) {
  console.log("[思考中...] 状況を確認しています...");

  // 1. セッションの初期化とツールの定義 (Function Declaration)
  const chat = ai.chats.create({
    model: "gemini-2.5-pro",
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{
        functionDeclarations: [{
          name: "fetchServiceStatus",
          description: "指定したサービス (github, discord, cloudflare) の現在の障害ステータスを取得する",
          parameters: {
            type: Type.OBJECT,  // ★ TSエラー修正: 単なる文字列ではなく Type.OBJECT を使用
            properties: {
              serviceName: {
                type: Type.STRING,  // ★ TSエラー修正: Type.STRING を使用
                description: "取得対象のサービス名。github, discord, cloudflareのいずれか"
              }
            },
            required: ["serviceName"]
          }
        }]
      }]
    }
  });

  try {
    // 2. ユーザーからの指示をGeminiに送信
    let response = await chat.sendMessage({ message: userPrompt });

    // 3. AIが「APIを叩く必要がある (Function Call)」と判断した場合の再帰的ループ
    while (response.functionCalls && response.functionCalls.length > 0) {
      for (const call of response.functionCalls) {
        if (call.name === "fetchServiceStatus") {
          // LLMが要求してきた引数を取り出す
          // ★ TSエラー修正: call.args がオプショナル(undefinedの可能性)なため、?. や (as any) で安全にアクセスする
          const serviceName = (call.args as any)?.serviceName as string;
          console.log(`[実行] ${serviceName} のステータスを取得中...`);

          // ツールの実行 (Phase 2のコード)
          const rawResult = await fetchServiceStatus(serviceName);
          
          // ★絶対防衛線: LLMに結果を渡す前に必ずマスキングを通す (Phase 3のコード)
          const safeResult = maskSensitiveData(rawResult);

          // マスキング済みの安全な結果をGeminiに返却し、さらに思考を進めさせる
          response = await chat.sendMessage({
            message: [{
              functionResponse: {
                name: call.name,
                response: { result: safeResult }
              }
            }]
          });
        }
      }
    }

    // 4. 最終的なAIの回答を出力
    console.log("\\n【レポート】");
    console.log(response.text);

  } catch (error) {
    console.error("エージェント実行中にエラーが発生しました:", error);
  }
}
```

> **なぜこれが必要か:**
>
> - `while (response.functionCalls)` ループ: ユーザーが「GitHubとDiscordを調べて」と指示した場合に、AIが連続で複数回ツールを呼び出せるようにするための標準的なパターンです。
> - `maskSensitiveData(rawResult)`: ここがアーキテクチャ上の**最重要関所**です。取得したJSON（IPなどの機密が含まれるかもしれない生データ）はここでフィルター処理されるため、LLM側に不正なデータが流出・学習される事故を防ぎます。

---
**作業が完了しましたら、「Phase 4コーディング完了」とお伝えください。**
いよいよ最終段階の、ターミナルから引数を受け取って実行する「CLIエントリーポイントの作成（Phase 5）」に進みます。
