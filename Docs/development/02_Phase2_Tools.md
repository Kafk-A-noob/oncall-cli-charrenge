# Phase 2: 外部API連携ツールとバリデーションの実装

## 概要

本フェーズでは、指定された3つのサービス（GitHub, Discord, Cloudflare）の障害状況を取得する「ツール関数」を実装します。
この関数は、後続のフェーズでLLM（Gemini）が自律的に呼び出す対象となります。

LLMは予測不可能な文字列を返してくること（大文字小文字のブレや、"github.com"のような表記ゆれ）があるため、
**Zodの強力な機能を使って事前に入力値を整える（正規化する）**防衛的な実装を行います。

## 作業手順

### `src/tools/index.ts` の実装

ユーザー様のエディタで `src/tools/index.ts` を開き、以下のコードをコピー＆ペースト（またはコーディング）してください。

```typescript
import { z } from "zod";

/**
 * 1. Zodによる入力値の正規化（揺れ吸収）パイプライン
 * 
 * [学習のための解説]
 * - preprocess: バリデーション（型チェック）が行われる「前」に、値を加工します。
 *   ここでは文字列の前後の空白を消し、小文字に統一しています。
 * - transform: バリデーションが通った「後」に、値をさらに別の形に変換します。
 *   LLMが「github.com」や「Discord API」等と出力しても、キーワードが含まれていれば
 *   安全で厳密なキー（列挙型相当）に丸め込んでいます。
 */

/*
初期案。ZodIssueCode.customは古い書き方だったようなので修正。
export const ServiceNameSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.trim().toLowerCase() : val),
  z.string()
).transform((val, ctx) => {
  if (val.includes("github")) return "github";
  if (val.includes("discord")) return "discord";
  if (val.includes("cloudflare")) return "cloudflare";
  
  // マッチしない場合は不正な入力としてZodの機能でエラー弾きを行う
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "提供されていない、または無効なサービス名です。",
  });
  return z.NEVER;
});
*/

// サービスの正解リストをEnumとして定義する
const ServiceEnum = z.enum(["GitHub", "Discord", "Cloudflare"]);

// スキーマ処理パイプライン
export const ServiceNameSchema = z
  .string()
  // LLMの揺れを吸収するため、ここで強制的に小文字化する
  .transform((val) => val.trim().toLowerCase())
  .transform((val) => {
    // 揺れを吸収して、正解の形式に変換
    if (val.includes("github")) return "GitHub";
    if (val.includes("discord")) return "Discord";
    if (val.includes("cloudflare")) return "Cloudflare";
    return val; // どれにもマッチしなかった場合は元のまま次へ流す
  })
  .pipe(ServiceEnum); // 最終的に正解のリストを通るかチェック

// ZodスキーマからTypeScriptの型を抽出
export type ServiceName = z.infer<typeof ServiceNameSchema>;

/*
 * 2. 各サービスのAPIエンドポイントの定義
 * 実はGitHub, Discord, Cloudflareは全て同じSaaS（Atlassian Statuspage）
 * を利用しているため、APIの構造が完全に一致するという裏技的な共通点があります。
 */
const SERVICE_ENDPOINTS: Record<ServiceName, string> = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  discord: "https://discordstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
};

/*
 * 3. 実際にAPIを叩いて情報を取得するツール関数
 */
export async function fetchServiceStatus(rawLLMInput: unknown): Promise<string> {
  try {
    // Zodパイプラインを通過させ、安全な文字列に変換
    const service = ServiceNameSchema.parse(rawLLMInput);
    const url = SERVICE_ENDPOINTS[service];

    // APIを呼び出す
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTPエラー: ステータス ${response.status}`);
    }

    const data = await response.json();
    
    // LLMに解釈させる情報を最小限に絞る（トークン消費節約＆ハルシネーション防止）
    const result = {
        service: service,
        status: data.status.description, // 全体ステータスの概要文
        indicator: data.status.indicator, // 重大度 (none, minor, critical 等)
    };

    return JSON.stringify(result);

  } catch (error) {
    // 【シニアエンジニアからの知見】フェイルセーフの設計
    // この関数内でエラーを throw してアプリ全体を落とすのではなく、
    // 「取得に失敗した」という事実を JSON 形式で返し、LLM側にそれを状況として認識させます。
    return JSON.stringify({
      error: "ステータスの取得に失敗しました",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
```

### この実装における技術的な意図（解説）

1. **Zodによる「防衛的プログラミング」:**
   AIの出力は常に100%信用できるわけではありません。`zod` を使うことで、関数を利用する内部ロジック（`fetch`のアドレス組み立て等）に**「絶対に100%正しい文字列しか到達しない」**ことをシステムレベルで保証しています。
2. **クラッシュを防ぐエラーハンドリング:**
   もしDiscord等のAPIインフラ自体が落ちていた場合、プログラムが異常終了していては「オンコール対応支援ツール」としての価値がなくなります。`try-catch` でエラーを文字情報として包み込み、「APIが応答しません」であることを問題なくAIに認識させる強固な設計にしています。

---
**作業が完了しましたら、AIへ「Phase 2完了」とお伝えください。**
続いて、セキュリティの要となる機密情報マスキング処理 (Phase 3) へ進みます。
