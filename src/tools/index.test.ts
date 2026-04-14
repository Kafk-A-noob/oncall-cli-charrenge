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