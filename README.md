# Magic Workshop

小中高生向けワークショップで、先生の言葉から4チーム分のミニアプリを生成・配信するコンソールです。

## 起動

Node.js 20以降と、ログイン済みの `claude` または `codex` CLIが必要です。

```sh
npm install
npm start
```

先生用画面は `http://localhost:3000/console`、生徒用画面は `/t/team1/` 〜 `/t/team4/` です。

`config.json` で生成CLIとポートを設定できます。環境変数が優先されます。

- `GENERATOR=claude|codex`
- `PORT=3000`
- `CONSOLE_TOKEN=任意のトークン`（設定時は `/console?token=...` で開く）
- `PUBLIC_URL=https://公開ホスト名`（リバースプロキシ環境のQRコード用）
- `PUBLISH_DIR=/永続ボリューム/magic-workshop-published`（作品スナップショットの保存先）
- `PUBLISH_BASE_URL=https://works.sasara.io`（保存作品の固定公開URL）

生成データは起動時に `data/team1` 〜 `data/team4` に作成され、再起動後も保持されます。

## 作品を固定URLで保存する

各チームのペインにある「作品保存」を押すと、その時点のHTMLを変更不可の
スナップショットとして保存します。発行済み作品は後からチームのアプリを編集しても
変化しません。コンソールには固定URLとQRコードが表示されます。

開発時は `published/<作品ID>/index.html` に保存され、同じサーバーの
`/published/<作品ID>/` で確認できます。本番では `PUBLISH_DIR` をCaddyが
読み取る永続ディレクトリへ向け、`PUBLISH_BASE_URL` に作品専用ドメインを設定します。

作品URLは推測しにくいランダム部分を含み、公開サーバーは `noindex` を返します。
ただし認証URLではないため、URLを知っている人は閲覧できます。

## テスト

```sh
npm test
```
