# Phase 8: 自動化単体テスト（Unit Test）の導入

ここまでの全フェーズで、セキュリティ（マスキング）と堅牢性（入力バリデーション、エラーハンドリング）を備えたプロ品質のツールが完成しました。最後に、これらの「絶対に壊してはいけない防衛線」が正常に機能することをプログラム自身に証明させる **自動テスト** を導入します。

通常、Node.js環境ではJest等の外部ライブラリの面倒な設定が必要ですが、本プロジェクトで採用した `Bun` には超高速なテストランナーが標準で組み込まれているため、テストコードを置くだけで0秒で導入できます。

## 1. マスキングロジックのテスト

機密情報を隠蔽する `masking.ts` が、想定通りにIPアドレスやトークンを潰してくれるかをチェックします。
以下の内容で `src/core/masking.test.ts` というファイルを新規作成してください。

```typescript
import { expect, test, describe } from "bun:test";
import { maskSensitiveData } from "./masking";

describe("Security Layer: masking.ts の自動テスト", () => {
  test("IPv4アドレスが正しく[MASKED]に置換されること", () => {
    const input = "内部システムのIPは 192.168.1.100 です。";
    expect(maskSensitiveData(input)).toBe("内部システムのIPは [MASKED] です。");
  });

  test("Bearerトークン（APIキー等の漏洩）が防御されること", () => {
    const input = "Authorization: Bearer secret-token-abcde-12345 を使用";
    expect(maskSensitiveData(input)).toBe("Authorization: [MASKED] を使用");
  });

  test("JWTトークン（認証情報の漏洩）が防御されること", () => {
    const input = "取得したトークン: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWI...";
    const result = maskSensitiveData(input);
    expect(result).not.toContain("eyJhbG"); // 元の文字列が含まれていないこと
    expect(result).toContain("[MASKED]");  // マスクされていること
  });
});
```

## 2. 入力バリデーション（Zod）のテスト

人間やAIが発する「表記揺れ」を、正しく規定のEnum（GitHub, Discord, Cloudflare）に吸着させられるかをチェックします。
以下の内容で `src/tools/index.test.ts` というファイルを新規作成してください。

```typescript
import { expect, test, describe } from "bun:test";
import { ServiceNameSchema } from "./index";

describe("Validation Layer: tools/index.ts の自動テスト", () => {
  test("日本語の揺れ（ひらがな・カタカナ）を正しく吸収すること", () => {
    // 期待通りに変換されればパス
    expect(ServiceNameSchema.parse("ぎっとはぶ")).toBe("GitHub");
    expect(ServiceNameSchema.parse("ギットハブ")).toBe("GitHub");
    expect(ServiceNameSchema.parse("ディスコード")).toBe("Discord");
    expect(ServiceNameSchema.parse("でぃすこーど")).toBe("Discord");
    expect(ServiceNameSchema.parse("くらうどふれあ")).toBe("Cloudflare");
  });

  test("大文字・小文字・無駄なスペースが混ざっていても正規化されること", () => {
    expect(ServiceNameSchema.parse("   GITHUB  ")).toBe("GitHub");
    expect(ServiceNameSchema.parse(" Discord ")).toBe("Discord");
  });

  test("全く関係ない文字列が入力された場合はZodErrorを弾き返すこと", () => {
    // エラーがスローされることを期待するテスト
    expect(() => ServiceNameSchema.parse("yahoo")).toThrow();
    expect(() => ServiceNameSchema.parse("12345")).toThrow();
  });
});
```

---

## 3. 自動テストの実行方法

上記の2つのファイルを作成したら、ターミナルで以下のコマンドを実行するだけです。

```bash
bun test
```

Bun が自動で `*.test.ts` を探し出し、超高速で検証を実行します。
緑色で `✓ 5 pass` のように表示されれば成功です！
