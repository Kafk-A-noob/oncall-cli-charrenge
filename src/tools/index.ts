import { z } from "zod";

/*========================================
  タイムアウト制御 + 1回リトライ付き fetch
  障害時のAPI遅延によるCLIフリーズを防止する
=========================================*/

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

/*=====================================
入力値の正規化
preprocess: バリデーションの前に実行される
transform: バリデーションの後に実行される
=====================================*/

// サービスの正解リストをEnumとして定義する
const ServiceEnum = z.enum(["GitHub", "Discord", "Cloudflare"]);

// スキーマ処理パイプライン
export const ServiceNameSchema = z
  .string()
  .transform((val) => val.trim().toLowerCase()) // 小文字化
  .transform((val) => {
    // 揺れを吸収して、正解の形式に変換（英字・カナ・ひらがな等）
    if (val.includes("github") || val.includes("ギットハブ") || val.includes("ぎっとはぶ")) return "GitHub";
    if (val.includes("discord") || val.includes("ディスコード") || val.includes("でぃすこーど")) return "Discord";
    if (val.includes("cloudflare") || val.includes("クラウドフレア") || val.includes("くらうどふれあ")) return "Cloudflare";
    return val; // どれにもマッチしなかった場合は元のまま次へ流す
  })
  
  .pipe(ServiceEnum); // 最終的に正解のリストを通るかチェック

// ZodスキーマからTypeScriptの型を抽出
export type ServiceName = z.infer<typeof ServiceNameSchema>;

/*====================
APIエンドポイントの定義
====================*/

const SERVICE_ENDPOINTS: Record<ServiceName, string> = {
  "GitHub": "https://www.githubstatus.com/api/v2/status.json",
  "Discord": "https://discordstatus.com/api/v2/status.json",
  "Cloudflare": "https://www.cloudflarestatus.com/api/v2/status.json",
  // aws: "https://status.aws.amazon.com/data.json",
};

/*===============================
APIを叩いて情報を取得するツール関数
=================================*/

export async function fetchServiceStatus(rawLLMInput: unknown): 
Promise<string> {
  try {
    // Zodパイプラインを通過させ、安全な文字列に変換
    const service = ServiceNameSchema.parse(rawLLMInput);
    const url = SERVICE_ENDPOINTS[service];

    // APIを呼び出す
    const response = await fetchWithRetry(url);
    
interface StatusPageResponse {
  status: {
    description: string;
    indicator: string;
  };
}
    const data = (await response.json()) as StatusPageResponse;

    // LLMに解釈させる情報を最小限に絞る（トークン消費節約＆ハルシネーション防止）
    const result = {
      service: service,
      status: data.status.description, // 全体ステータスの概要文
      indicator: data.status.indicator, // 重大度 (none, minor, critical 等)
    };


    return JSON.stringify(result);
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
}