# portfolio-v3

まろん｡([montblank.fun](https://montblank.fun)) のポートフォリオサイト。Astro (静的サイト) + Hono (GitHub活動集計API) の pnpm workspace 構成。

## 構成

```
/                 Astro (静的サイト本体)
├── src/          ページ・コンポーネント・GitHub連携クライアントなど
├── public/       静的アセット
├── integrations/ 独自Astroインテグレーション(フォントサブセット化)
└── server/       Hono製サーバー (dist/配信 + /api/github, /api/works, /api/contributions, /api/favicon)
```

`server/` はビルド成果物 (`dist/`) の配信と、GitHub関連データの取得・キャッシュを一手に担う。Astro側は外部サイトを直接叩かず、常に `server/` 経由でデータを取得する(詳細は各モジュールのコメントを参照)。

## セットアップ

```sh
pnpm install
cd server && cp .env.example .env && $EDITOR .env   # GITHUB_TOKEN などを設定
cd ..
```

## コマンド

| コマンド            | 内容                                                       |
| :------------------ | :--------------------------------------------------------- |
| `pnpm dev`          | Astro dev serverとHono serverを同時起動 (`localhost:4321`) |
| `pnpm build`        | Astroを `./dist/` にビルド                                 |
| `pnpm preview`      | ビルド結果をローカルでプレビュー                           |
| `pnpm lint`         | ESLintでチェック                                           |
| `pnpm lint:fix`     | ESLintで自動修正                                           |
| `pnpm format`       | Prettierで整形                                             |
| `pnpm format:check` | Prettierの整形チェックのみ                                 |

`server/` 単体のコマンド (`pnpm --filter marron-portfolio-server <script>`) は `server/package.json` を参照。

## デプロイ

VPS上でのデプロイ手順は [`deploy/README.md`](./deploy/README.md) を参照。
