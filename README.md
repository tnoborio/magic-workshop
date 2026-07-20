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

生成データは起動時に `data/team1` 〜 `data/team4` に作成され、再起動後も保持されます。

## テスト

```sh
npm test
```
