import { runAgent } from "../core/agent.js";

async function main() {

  // ターミナルから渡された引数を受け取る (プロセス引数の3番目以降を結合)
  const args = process.argv.slice(2);
  const debugMode = process.argv.includes("--debug")
  // --debug を除外した残りをプロンプトとして結合
  const prompt = args.filter(a => a !== "--debug").join(" ");

  // HowToを兼ねたhelp機能

  if (prompt === "-h" || prompt === "--help" || prompt === "-help" || prompt === "help") {
    // `で囲んでそのままの見た目で出す
    console.log(`
      =========================================
      Oncall CLI Agent 初動調査AIツール

      使い方: bun run start "<聞きたいこと>"
      対応サービス:
      - GitHub
      - Discord
      - Cloudflare
      実行例:
      bun run start "DiscordとGitHubの状況を調査して"

      オプション:
      --debug  AIの推論プロセス(Function Calling)の詳細を表示

      =========================================
    `);
    process.exit(0); // 正常終了(help表示は正常動作のため。)
  }

  // 引数なしで実行された場合の保険
  if (!prompt) {
    console.error("エラー：調査したいサービスを引数で渡してください");
    console.error('例: ./oncall (又は bun run start) "Discordの状況を調査して"');
    process.exit(1);
  }

  try {
    // Phase 4 で作成したエージェントを呼び出す
    await runAgent(prompt, debugMode);
  } catch (error) {
    console.error("\n 予期せぬエラーが発生しました");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1); // 異常終了ステータスで抜ける(CLIの終了コード)
  }
}

// プログラム開始
main();