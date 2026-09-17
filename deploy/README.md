# デプロイ構成 (VPS / Ubuntu 24)

```
Internet
   │ :443
   ▼
[nginx]        TLS終端のみ。すべてを Anubis へ流す。
   │ :8923 (127.0.0.1)
   ▼
[Anubis]       PoW方式でボットを弾くリバースプロキシ。
   │ :3000 (127.0.0.1)
   ▼
[Hono app]     dist/ の静的配信 + /api/github/:user を1プロセスで担当。
               systemd (marron-portfolio.service) で常駐。
```

## 初回セットアップ

```bash
# 1. リポジトリを配置
sudo mkdir -p /opt/marron-portfolio
sudo chown marron:marron /opt/marron-portfolio
git clone <repo> /opt/marron-portfolio
cd /opt/marron-portfolio

# 2. 依存関係のインストール (pnpm workspace。ルートと server/ をまとめて1回で入る)
pnpm install

# 3. Astro サイトをビルド
pnpm run build            # dist/ が生成される

# 4. サーバーの .env を用意してビルド
cd server
cp .env.example .env
$EDITOR .env             # GITHUB_TOKEN、他プロセスと衝突しなければ PORT はそのままでよい
pnpm run build            # dist/index.js が生成される
cd ..

# 5. Anubis をインストール (公式 apt リポジトリ, 詳細は
#    https://anubis.techaro.lol/docs/admin/installation/)
sudo cp deploy/anubis.env /etc/anubis/marron-portfolio.env
$EDITOR /etc/anubis/marron-portfolio.env   # COOKIE_DOMAIN、TARGET のポート等を実環境に
sudo systemctl enable --now anubis@marron-portfolio

# 6. Hono アプリを systemd サービス化
sudo cp deploy/systemd/marron-portfolio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now marron-portfolio

# 7. nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/marron-portfolio
$EDITOR /etc/nginx/sites-available/marron-portfolio   # server_name / 証明書パス
sudo ln -s /etc/nginx/sites-available/marron-portfolio /etc/nginx/sites-enabled/
sudo certbot --nginx -d example.com   # まだ証明書が無ければ
sudo nginx -t && sudo systemctl reload nginx
```

## デプロイ更新時 (再ビルド〜反映)

```bash
cd /opt/marron-portfolio
git pull
pnpm install && pnpm run build          # Astro を再ビルド
sudo systemctl restart marron-portfolio   # 新しい dist/ を配信し直す
```

Astro は `server/`自身のURL (`http://127.0.0.1:<PORT>/api/github/otnc`) を常に参照するため、ビルド時点で自前APIから直接データを取得できる。ビルド前に `marron-portfolio` サービスが起動している必要がある点に注意。

## ポイント

- **pnpm workspace**: ルートの Astro サイトと `server/` を1つのworkspaceとして管理している(`pnpm-workspace.yaml`)。依存関係のインストールはリポジトリ直下で `pnpm install` を1回実行するだけでよい。
- **Hono側でdist/を配信する理由**: nginxを二重に挟まず、静的配信とAPIを1プロセスに集約してシンプルに保つため。
- **GitHub活動集計 (`/api/github/:user`)**: `otnc/github-most-used-langs` の考え方(言語内訳・プロフィール統計・日次アクティビティ)を Hono + GitHub GraphQL API で再実装し、GraphQL の `contributionsCollection` をアカウント作成年〜現在年まで1リクエストにまとめて問い合わせることで**全期間の総コントリビュート数**を新たに算出している(`server/src/lib/githubGraphql.ts` の `fetchAllTimeContributions`)。
- **キャッシュ (server/)**: ファイルキャッシュ + stale-while-revalidate。起動時と `REFRESH_INTERVAL_MS` 間隔で裏更新し、GitHub側の障害時は直近のキャッシュを返し続ける(stale-if-error)。
- **キャッシュ (Astroビルド時)**: Works/Contributionsセクション用に `src/lib/github.ts` が使うGitHub検索API・言語内訳・Linguist配色データは `.cache/` (gitignore対象) に最大12時間キャッシュし、`astro build` を繰り返してもレート制限を避けられるようにしている(`src/lib/buildCache.ts`)。
- **ピン留めリポジトリの取得**: GitHubには公式APIが無いため、プロフィールページのHTMLを解析して取得するのを基本とし、解析に失敗した場合のみ非公式API (pinned.berrysauce.dev) にフォールバックする。
- **言語の色**: ハードコードせず、Linguist準拠の色一覧 (ozh/github-colors) を都度取得してキャッシュする。取得自体に失敗した場合のみ最低限のフォールバック色を使う。
