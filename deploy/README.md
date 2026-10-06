# デプロイ構成 (VPS / Ubuntu 24)

```
Internet
   │ :443
   ▼
[nginx]        TLS終端。Honoアプリへ直接リバースプロキシ。
   │ :3010 (127.0.0.1) ※ .env.example の PORT
   ▼
[Hono app]     dist/ の静的配信 + /api/github, /api/works, /api/contributions,
               /api/blog, /api/favicon, /api/counter を1プロセスで担当。
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

# 5. (任意) Anubis をインストール (公式 apt リポジトリ, 詳細は
#    https://anubis.techaro.lol/docs/admin/installation/)
sudo cp deploy/anubis-policy.yaml /etc/anubis/marron-portfolio-policy.yaml
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

## Anubisを使わない場合

nginxのHTTPS設定で、`proxy_pass`をHonoのポート(`127.0.0.1:3010`)へ向けます。
Anubisをすでに起動している場合は、先にnginx設定を切り替えてからAnubisを停止してください。

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/marron-portfolio
# server_name、証明書パス、Honoのポートを実環境に合わせて編集
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl disable --now anubis@marron-portfolio
```

`anubis@marron-portfolio`を停止したあと、ポートの確認を行う。他のサービス(`anubis@openmiq-web`など)が`8923`を使用している場合があるため、`8923`が空いていること自体は要件ではない。

```bash
sudo systemctl is-active anubis@marron-portfolio || true
sudo ss -tlnp | grep -E ':(3010)\b'
```

## デプロイ更新時 (再ビルド〜反映)

本番ディレクトリはGit管理せず、リポジトリの作業ツリーから同期して更新する。`/opt/marron-portfolio`の`.env`、キャッシュ、永続データは更新スクリプトが保持する。

```bash
cd /root/projects/portfolio-v3
deploy/update.sh
```

このスクリプトは次の順序で更新する。

1. ソースを`/opt/marron-portfolio`へ同期する
2. 依存関係をインストールする
3. `server/`をビルドしてHonoを再起動する
4. Astroをビルドして静的ファイルを生成する
5. Honoを再起動して新しい`dist/`を配信する

別の配置先を使う場合は`TARGET_DIR`で変更できる。

```bash
TARGET_DIR=/srv/marron-portfolio deploy/update.sh
```

`server/`側の変更が**キャッシュされたデータの中身**(GitHubの言語色・pinnedリポジトリ・コントリビュートの集計方法など)に関わる場合は、古いキャッシュが残ったままだと再ビルドしても変化が見えないことがある。その場合は該当キャッシュを消してから`marron-portfolio`を再起動する:

```bash
rm -rf server/cache/<該当ディレクトリ>   # 例: server/cache/works, server/cache/contributions
sudo systemctl restart marron-portfolio
pnpm run build   # Astroも焼き直す
```

Astro は `server/`自身のURL (`http://127.0.0.1:<PORT>/api/github/otnc` など) を常に参照するため、ビルド時点で自前APIから直接データを取得できる。**ビルドの直前に `marron-portfolio` サービスが最新のコードで起動している必要がある**点に注意。

## ポイント

- **pnpm workspace**: ルートの Astro サイトと `server/` を1つのworkspaceとして管理している(`pnpm-workspace.yaml`)。依存関係のインストールはリポジトリ直下で `pnpm install` を1回実行するだけでよい。
- **Hono側でdist/を配信する理由**: nginxを二重に挟まず、静的配信とAPIを1プロセスに集約してシンプルに保つため。
- **外部APIは全てserver/経由**: Astro/ブラウザ側からGitHubや他サイトを直接叩くことはせず、`server/`が公開する `/api/github/:user`・`/api/works/:user`・`/api/contributions/:user`・`/api/blog`・`/api/favicon` を経由する。任意の外部ホストへのリクエストや取得結果の扱いを1箇所に集約するため。
- **GitHub活動集計 (`/api/github/:user`)**: `otnc/github-most-used-langs` の考え方(言語内訳・プロフィール統計・日次アクティビティ)を Hono + GitHub GraphQL API で再実装し、GraphQL の `contributionsCollection` をアカウント作成年〜現在年まで1リクエストにまとめて問い合わせることで**全期間の総コントリビュート数**を新たに算出している(`server/src/lib/githubGraphql.ts` の `fetchAllTimeContributions`)。
- **Works/Contributions (`/api/works/:user`, `/api/contributions/:user`)**: pinnedリポジトリ・言語内訳・マージ済みPRの集計を行う(`server/src/lib/githubWorks.ts`)。
- **favicon (`/api/favicon`)**: 対象サイトのHTMLをUAを偽装して解析しfaviconを取得・配信するプロキシ(`server/src/lib/favicon.ts`)。SSRF対策としてプライベートIP/内部アドレスへのアクセスは拒否する。
- **表示の更新方式(ビルド時のスナップショット + ブラウザ側での再取得)**: Blog / Works / Contributions / GitHub の各セクションはPreactのアイランド(`src/components/islands/`)で、ビルド時に取得した値を初期表示(スナップショット)としてHTMLに焼き込みつつ、ページを開いたブラウザからも `/api/*` を再取得して最新値に差し替える。表示を最新にするためだけにサイトを再ビルドする必要はない(コードや静的な文言を変えたときだけ再ビルドする)。JS無効環境やビルド時に取得へ失敗した場合はスナップショットのまま表示される。
- **キャッシュ**: すべて `server/cache/` 配下にファイルキャッシュとして保存する。いずれもstale-while-revalidate(期限が切れていても古い値を即座に返し、裏で再取得する)で、再取得に失敗した場合は古い値を返し続ける(stale-if-error)ため、ブラウザから呼ばれても待たされない。
  - GitHub活動 (`server/cache/github-*.json`): 起動時と `REFRESH_INTERVAL_MS` 間隔で裏更新する。TTLは `.env` の `CACHE_TTL_SECONDS`(既定1時間)。
  - Works/Contributions (`server/cache/works/`, `server/cache/contributions/`): 1時間(`server/src/lib/githubWorks.ts`)。
  - Blog (`server/cache/blog/`): Blog・Zenn・Qiita・noteのRSS/Atomを統合し、10分(`server/src/lib/blog.ts`)。
  - 上記は起動時にウォームアップされるため、再起動直後の最初の訪問者も待たされない。
  - 言語の色 (メモリキャッシュ): Linguist準拠の色一覧 (ozh/github-colors) を24時間キャッシュ。取得自体に失敗した場合のみ最低限のフォールバック色を使う(`server/src/lib/languageColors.ts`)。
  - favicon (`server/cache/favicon/`): 7日間キャッシュ。
  - 手動でキャッシュを消したい場合は該当ディレクトリを `rm -rf` してサービスを再起動すればよい。
  - 取得に失敗したときは空の結果で上書きせず、キャッシュ済みの古い値を残す(fetcherは失敗時にthrowする)。
- **アクセスカウンター (`/api/counter`)**: `server/data/counter.json` に永続化する。`server/cache/` と違って消してはいけないため、デプロイ時のrsyncでも `server/data` は除外すること。
- **ピン留めリポジトリの取得**: GitHubには公式APIが無いため、プロフィールページのHTMLを解析して取得するのを基本とし、解析に失敗した場合のみ非公式API (pinned.berrysauce.dev) にフォールバックする。
- **AnubisのOpen Graph passthrough (`deploy/anubis-policy.yaml`)**: 既定のボットポリシーのままだと、Discord/Twitter/Slack等のリンクプレビュー用ボットもUser-Agentに`Mozilla`を含むため一般ブラウザ扱いされてPoWチャレンジを出されてしまい、解けないのでOGPが一切表示されない。`openGraph.enabled: true` を有効にすると、チャレンジ対象のリクエストにもバックエンドから取得したOGPタグだけを含む軽量なHTMLが返るようになり、チャレンジを解けないボットでも正しいOGPプレビューを取得できる(通常ブラウザは従来通りチャレンジされ、挙動が変わるのはOGP取得時のみ)。
