# 開発フェーズ計画書 (MVP)

本ドキュメントは、「オンコール対応初動支援エージェント」の開発を段階的に進めるためのフェーズ計画です。
各フェーズ完了ごとに動作確認を行い、ユーザーの承認を得てから次のフェーズへ進みます。

## Phase 1: プロジェクト環境構築 (Environment Setup)

- [ ] `bun init` によるプロジェクト初期化
- [ ] パッケージのインストール (`@google/genai`, `zod`, `typescript`, `@types/node` など)
- [ ] `tsconfig.json` のセットアップ（`strict: true` の担保）
- [ ] `package.json` スクリプト定義（`start` の追加）
- [ ] 用途別ディレクトリと空ファイルの作成（`src/cli`, `src/core`, `src/tools` 等）

## Phase 2: 外部API連携ツールとバリデーションの実装

- [ ] ツール関数の実装: 対象となるパブリックAPI（GitHub, Discord, CloudflareのStatus API）を呼び出す関数の作成 (`src/tools/`)
- [ ] LLMのハルシネーション・揺れ対策: Zod (`preprocess`, `transform`) を用いた引数の正規化パイプラインの構築

## Phase 3: データマスキング処理の実装

- [ ] APIレスポンス内の機密情報（IPアドレス、クレデンシャル等）を検出し `[MASKED]` に置換するマスキング機構の実装 (`src/core/masking.ts`)

## Phase 4: コアロジック（エージェント）の構築

- [ ] Gemini API (`@google/genai`) を連携したエージェントの初期化処理 (`src/core/agent.ts`)
- [ ] Function Callingの呼び出しループ制御と、ツール実行後のレスポンス群に対するマスキング処理の適用

## Phase 5: CLIフロントエンドとUXの統合

- [ ] コマンドラインから入力を受け付けるエントリーポイントの作成 (`src/cli/index.ts`)
- [ ] 「[思考中...] 状況を確認しています」等のシステム稼働（UX確保）用のステータスログの表示処理
- [ ] 結合テスト（全体疎通試験）と最終調整

## 今後の展望 (MVP完了後)

- `docs` および関連ドキュメントの、リポジトリ (`oncall-cli-charrenge`) 内部への移動と構成の再編
- Honoを用いた Web API 用エントリーポイントへの拡張（将来要件）
