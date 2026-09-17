# デプロイ構成 (VPS / Ubuntu 24)

```
Internet
   │ :443
   ▼
[nginx]        TLS終端のみ。すべてを Anubis へ流す。
   │ :8923 (127.0.0.1) ※ deploy/anubis.env の BIND
   ▼
[Anubis]       PoW方式でボットを弾くリバースプロキシ。
   │ :3010 (127.0.0.1) ※ .env.example の PORT
   ▼
[Hono app]     dist/ の静的配信 + /api/github, /api/works, /api/contributions,
               /api/favicon を1プロセスで担当。
               systemd (marron-portfolio.service) で常駐。
```

ポート番号はあくまで既定値。同じVPS上で他のサービスと衝突する場合は `.env` の `PORT` と `deploy/anubis.env` の `BIND`/`TARGET`、`deploy/nginx.conf` の `proxy_pass` 先を揃えて変更すること(実際に本番では Misskey が :3000 を使っていたため :3010 に変更している)。

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

# 4. .env を用意してサーバーをビルド (.env はリポジトリ直下に置く)
cp .env.example .env
$EDITOR .env              # GITHUB_TOKEN、他プロセスと衝突しなければ PORT はそのままでよい
cd server
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

**`systemctl restart` は `dist/index.js` を再実行するだけで、TypeScriptの再コンパイルは一切行わない。** `server/`側のコードを変更した場合、先に `server/` を再ビルドしてから再起動しないと、再起動しても変更前のコードが動き続けるので注意(このREADMEの旧版はここが抜けていた)。

```bash
cd /opt/marron-portfolio
git pull
pnpm install

# 1. server/ を先に再ビルド & 再起動する
#    (Astroのビルドは server/ に問い合わせて結果を静的ページへ焼き込むため、
#     server/ 側の変更を先に反映させておかないと古いデータのままビルドされてしまう)
cd server
pnpm run build            # dist/index.js を再生成
cd ..
sudo systemctl restart marron-portfolio

# 2. そのあとAstroを再ビルド (起動中のserver/へ問い合わせてビルド時に焼き込む)
pnpm run build
```

`server/`側の変更が**キャッシュされたデータの中身**(GitHubの言語色・pinnedリポジトリ・コントリビュートの集計方法など)に関わる場合は、古いキャッシュが残ったままだと再ビルドしても変化が見えないことがある。その場合は該当キャッシュを消してから `marron-portfolio` を再起動する:

```bash
rm -rf server/cache/<該当ディレクトリ>   # 例: server/cache/works, server/cache/contributions
sudo systemctl restart marron-portfolio
pnpm run build   # Astroも焼き直す
```

Astro は `server/`自身のURL (`http://127.0.0.1:<PORT>/api/github/otnc` など) を常に参照するため、ビルド時点で自前APIから直接データを取得できる。**ビルドの直前に `marron-portfolio` サービスが最新のコードで起動している必要がある**点に注意。

## ポイント

- **pnpm workspace**: ルートの Astro サイトと `server/` を1つのworkspaceとして管理している(`pnpm-workspace.yaml`)。依存関係のインストールはリポジトリ直下で `pnpm install` を1回実行するだけでよい。
- **Hono側でdist/を配信する理由**: nginxを二重に挟まず、静的配信とAPIを1プロセスに集約してシンプルに保つため。
- **外部APIは全てserver/経由**: Astro/ブラウザ側からGitHubや他サイトを直接叩くことはせず、`server/`が公開する `/api/github/:user`・`/api/works/:user`・`/api/contributions/:user`・`/api/favicon` を経由する。任意の外部ホストへのリクエストや取得結果の扱いを1箇所に集約するため。
- **GitHub活動集計 (`/api/github/:user`)**: `otnc/github-most-used-langs` の考え方(言語内訳・プロフィール統計・日次アクティビティ)を Hono + GitHub GraphQL API で再実装し、GraphQL の `contributionsCollection` をアカウント作成年〜現在年まで1リクエストにまとめて問い合わせることで**全期間の総コントリビュート数**を新たに算出している(`server/src/lib/githubGraphql.ts` の `fetchAllTimeContributions`)。
- **Works/Contributions (`/api/works/:user`, `/api/contributions/:user`)**: pinnedリポジトリ・言語内訳・マージ済みPRの集計を行う(`server/src/lib/githubWorks.ts`)。
- **favicon (`/api/favicon`)**: 対象サイトのHTMLをUAを偽装して解析しfaviconを取得・配信するプロキシ(`server/src/lib/favicon.ts`)。SSRF対策としてプライベートIP/内部アドレスへのアクセスは拒否する。
- **キャッシュ**: すべて `server/cache/` 配下にファイルキャッシュとして保存する。
  - GitHub活動 (`server/cache/github-*.json`): stale-while-revalidate。起動時と `REFRESH_INTERVAL_MS` 間隔で裏更新し、GitHub側の障害時は直近のキャッシュを返し続ける(stale-if-error)。TTLは `.env` の `CACHE_TTL_SECONDS`。
  - Works/Contributions (`server/cache/works/`, `server/cache/contributions/`): 最大12時間キャッシュ(`server/src/lib/simpleCache.ts`)。
  - 言語の色 (メモリキャッシュ): Linguist準拠の色一覧 (ozh/github-colors) を24時間キャッシュ。取得自体に失敗した場合のみ最低限のフォールバック色を使う(`server/src/lib/languageColors.ts`)。
  - favicon (`server/cache/favicon/`): 7日間キャッシュ。
  - 手動でキャッシュを消したい場合は該当ディレクトリを `rm -rf` してサービスを再起動すればよい。
- **ピン留めリポジトリの取得**: GitHubには公式APIが無いため、プロフィールページのHTMLを解析して取得するのを基本とし、解析に失敗した場合のみ非公式API (pinned.berrysauce.dev) にフォールバックする。
