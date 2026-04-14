/*===============================================================
 * セキュリティを担保するためのデータマスキング処理。
 * 外部APIのレスポンスやログ文字列から、機密情報らしきパターンを検出し
 * 強制的に [MASKED] へ置換する。
 *===============================================================*/

const MASK_REPLACEMENT = "[MASKED]";

/*=====================
検出のための正規表現定義
IPv4アドレス等を対象。
======================*/
const SENSITIVE_PATTERNS = [
  // IPv4アドレスの検出 (例: 192.168.1.1)
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

  /*
    IPv6アドレスの検出 (例: 2001:0db8::8a2e:0370:7334 や ::1 など)
    初期の記述では見づらかったため、可読性と保守性向上を狙いnew RegExpと配列結合を使用
  */
  new RegExp([
    '(?:',
      '(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}',     // 完全表記
      '|(?:[a-fA-F0-9]{1,4}:){1,7}:',                 // 後方省略 (例: 2001:db8::)
      '|:(?::[a-fA-F0-9]{1,4}){1,7}',                 // 前方省略 (例: ::1)
      '|(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}', // 中間省略 (例: 2001::1)
    ')'
  ].join(''), 'g'),
  
  // Bearer または Token に続くクレデンシャル文字列（APIキー漏洩対策）
  /(?:Bearer|Token|token)\s+[A-Za-z0-9\-\._~]+/g,

  // メールアドレス等の検出 (例: admin@example.com)
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

  /*
    JWT (JSON Web Token) の検出 (例: eyJhbG... から始まる文字列)
    認証エラー時のログ漏洩を防いでくれる
  */
  /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,

  /* 
    URL内のBasic認証情報 (例: https://user:pass@example.com の user:pass 部分)
    通信エラーログ等でのパスワード漏洩を防いでくれる。
    https:// と @ に挟まれた部分だけを狙い撃ちにする、
    肯定後読み(Lookbehind)/肯定先読み(Lookahead)という正規表現
  */
  /(?<=https?:\/\/)[^:\/]+:[^@\/]+(?=@)/g,

  /*=================================================================
  将来的な拡張性のためのコメントアウト
  AWS Access Key ID (AKIA...で始まる16桁の英数字)
  /AKIA[0-9A-Z]{16}/g,

  AWS Secret Access Key (ランダムな英数字の羅列)
  実際のキーはもっと長いが、パターンとしてこれでも十分と言っている。要検証。
  /[A-Za-z0-9\/\+]{40}/g,

  AWS Session Token (長いランダム文字列)
  /AQoDYXdzEJr.../g
  
  Slack Bot Token
  xoxb-...
  ==================================================================*/
];

/*==================
 * マスキング実行関数
 *=================*/

export function maskSensitiveData(input: string): string {
  if (!input) return input;
  
  let maskedText = input;

  // 定義したパターンを全て検査し、見つかれば置換する
  for (const pattern of SENSITIVE_PATTERNS) {
    maskedText = maskedText.replace(pattern, () => {
      // 今回は安全性を最優先し、マッチした箇所を一律でマスキングする
      return MASK_REPLACEMENT;
    });
  }

  return maskedText;
}

