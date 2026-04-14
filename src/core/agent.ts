import { GoogleGenAI, Type } from "@google/genai";
import { maskSensitiveData } from "./masking.js";
import { fetchServiceStatus } from "../tools/index.js";


// SDKの初期化 (環境変数 GEMINI_API_KEY を自動参照)
const ai = new GoogleGenAI({});

/*===============================================================
  要件に基づく出力方針(システムプロンプト)
  深夜のエンジニア向けに、コピペしやすい生データをシンプルに出力させる
================================================================*/

const SYSTEM_INSTRUCTION = `
あなたはインフラ保守運用を支援するシニア・初動対応AIエージェントです。
目的: 深夜に障害アラートで起こされたエンジニアの負担を即座に軽減すること。

【絶対の出力ルール】
- 取得した情報をもとに、現在の各状況を「日本語で簡潔に1〜2行で」要約して出力すること。
- 現場によって報告フォーマットが異なるため、Slack用などの特定の過剰装飾（無駄な絵文字、砕けた挨拶、気遣いの言葉、不要なマークダウン装飾）は一切行わないこと。
- 異常がある場合はその箇所のみを淡々と明記し、正常な場合は「すべて正常に稼働しています」と明記すること。
- コピペして使いやすい「正確な生データ」としての使い勝手も加味し、コピペ用の情報もコピーしやすいように提示すること。
`;

/*=====================================
 * CLIから呼ばれるエントリーポイント関数
======================================*/

export async function runAgent(userPrompt: string, debug: boolean = false) {
  // 思考中ログの出力
  console.log("[思考中...] 状況を確認しています...");
  
  // セッション初期化とツール定義
  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{
        functionDeclarations: [{
          name: "fetchServiceStatus",
          description: "指定したサービス(GitHub,Discord,Cloudflareの障害ステータスを取得する",
          parameters: {
            type: Type.OBJECT,
            properties: {
              serviceName: {
                type: Type.STRING,
                description: "取得対象のサービス名。github,discord,cloudflareのいずれか"
              }
            },
            required: ["serviceName"]
          }
        }]
      }]
    }
  });

  try {
    // ユーザーからの指示をGeminiに送信
    let response = await chat.sendMessage({
      message: userPrompt
    });

    // AIがAPIを叩く必要があると判断した場合の再帰的ループ
    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (response.functionCalls && response.functionCalls.length > 0) {
      if (loopCount >= MAX_LOOPS) {
        console.error("\n[警告] セーフティ機能: AIのツール呼び出しが上限回数(5回)に達したため、安全のためにループ処理を強制中断しました。");
        break;
      }
      loopCount++;

      for (const call of response.functionCalls) {
        if (call.name === "fetchServiceStatus") {
          // LLMが要求してきた引数を取り出す
          const serviceName = (call.args as any)?.serviceName as string;
          console.log(`[実行] ${serviceName} のステータスを取得中...`);

          if (debug) {
            console.log("\n--- [DEBUG] Function Calling 詳細 ---");
            console.log(`  ツール名: ${call.name}`);
            console.log(`  引数: ${JSON.stringify(call.args)}`);
            }

          // ツールの実行
          const rawResult = await fetchServiceStatus(serviceName);

          if (debug) {
            console.log(`  API応答(生): ${rawResult}`);
          }
          
          // LLMに結果を渡す前に必ずマスキングを通す
          const safeResult = maskSensitiveData(rawResult);

          if (debug) {
            console.log(`  マスク済み: ${safeResult}`);
            console.log("--- [DEBUG] END ---\n");
          }
          // マスキング済みの安全な結果をGeminiに返却、思考を進めさせる
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

    // 最終的なAIの回答を出力
    console.log("\n 【レポート】");
    console.log(response.text);
  } catch (error) {
    const errorStr = String(error);
    // 1. API無料枠(Quota)の枯渇やリミット超過(429)のハンドリング
    if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("Resource has been exhausted")) {
      console.error("\n[エラー] Gemini APIの無料枠(Quota)上限に到達しました。しばらく時間をおいてから再度お試しください。");
    } 
    // 2. 追加：Google側サーバーの一時的な混雑(503 / 500)のハンドリング
    else if (errorStr.includes("503") || errorStr.includes("500") || errorStr.includes("high demand") || errorStr.includes("UNAVAILABLE")) {
      console.error("\n[エラー] 現在Google GeminiのAPIサーバーが大変混雑しています。数分おいてから再度お試しください。");
    } 
    // 3. その他の予期せぬエラー
    else {
      // エラーの生オブジェクトではなく、メッセージだけ抽出して見栄えを良くする
      const cleanMessage = error instanceof Error ? error.message : errorStr;
      console.error("\n[エラー] エージェント実行中にエラーが発生しました:", cleanMessage);
    }
  }
}