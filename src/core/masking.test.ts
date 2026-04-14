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
    const input = "取得したトークン:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM.SflKxwRJSMeKKF2QT4fwpMe";
    const result = maskSensitiveData(input);
    expect(result).not.toContain("eyJhbG"); // 元の文字列が含まれていないこと
    expect(result).toContain("[MASKED]");  // マスクされていること
  });
});