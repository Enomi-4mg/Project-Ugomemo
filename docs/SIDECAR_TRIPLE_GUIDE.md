# Tauri Sidecar とターゲットトリプル（Target Triple）ガイド

このドキュメントは、Project Ugomemo における ffmpeg/ffprobe バイナリのバンドリングと実行時解決パターンについて説明します。

## 1. Tauri Sidecar と Target Triple の基礎

### 1.1 Target Triple とは

Rust および Tauri では **target triple** は以下の形式を持つビルドターゲット識別子です：

```
<architecture>-<vendor>-<os><-env>
```

**Project Ugomemo で対象とするプラットフォーム：**

| OS | CPU | Target Triple | 注記 |
|---|---|---|---|
| **Windows** | x86_64 | `x86_64-pc-windows-msvc` | MSVC ツールチェイン（標準） |
| **macOS** | x86_64 | `x86_64-apple-darwin` | Intel Mac |
| **macOS** | ARM64 | `aarch64-apple-darwin` | Apple Silicon (M1/M2/M3) |
| **Linux** | x86_64 | `x86_64-unknown-linux-gnu` | 標準 Linux |

### 1.2 Tauri が target triple を自動検出する箇所

Tauri のビルドスクリプト（`build.rs`）は以下を自動実行します：

```
1. cargo の実行環境から現在の target triple を検出
2. src-tauri/target/{target_triple}/release/ に成果物を出力
3. bundle/ フォルダで platform 固有のインストーラを生成
```

**例：** Windows でビルドした場合
```
src-tauri/target/x86_64-pc-windows-msvc/release/
  ├── project-ugomemo.exe        <- メインアプリ
  ├── project_ugomemo_lib.lib    <- Rust ライブラリ
  └── bundle/
      ├── msi/                   <- MSI インストーラ
      └── nsis/                  <- NSIS インストーラ
```

## 2. 外部バイナリ（ffmpeg/ffprobe）のバンドリング戦略

### 2.1 問題の根本原因

Tauri ではメインアプリケーション自体はコンパイルされますが、ffmpeg/ffprobe などの**外部バイナリ**は：
- ビルドシステムの一部ではない
- 手動でダウンロード＆配置する必要がある

**`tauri.conf.json` の `resources` 配列が何をするのか：**

```json
"bundle": {
  "resources": ["binaries/**"]
}
```

これは Tauri に「ビルド時に `binaries/` フォルダ内のすべてのファイルを最終パッケージ内に含めよ」と指示します。

### 2.2 Project Ugomemo の実装パターン

Project Ugomemo は **ハイブリッドアプローチ** を採用しています：

#### **開発時（local）:**
- `src-tauri/binaries/` フォルダに小さなプレースホルダーバイナリを配置
- Rust コードが実行時に以下の優先度で ffmpeg を探す：
  1. 環境変数 `UGOMEMO_FFMPEG_PATH`
  2. 実行可能ファイルの隣の `/binaries/` or `/resources/binaries/`
  3. CWD の `src-tauri/binaries/`
  4. PATH から `ffmpeg` コマンド（OS の ffmpeg を使用）

#### **CI リリースビルド時（release.yml）:**
- GitHub Actions が各プラットフォーム上でビルドを実行
- CI ステップで platform 固有の ffmpeg をダウンロード
- `tauri.conf.json` をビルド前に動的にパッチして `resources: ["binaries/**"]` を有効化
- 最終的なインストーラに ffmpeg が含まれる

## 3. Windows 環境での正しいファイル配置

### 3.1 ローカル Windows ビルド時

```
src-tauri/
├── binaries/
│   ├── ffmpeg.exe          ← Windows 実行ファイル
│   ├── ffprobe.exe         ← Windows 実行ファイル
│   └── FFMPEG_LICENSE_NOTICE.txt
├── tauri.conf.json         ← "resources": [] （空配列）
└── src/
    └── lib.rs              ← ffmpeg_cmd() / ffprobe_cmd() ロジック
```

### 3.2 CI Windows ビルド時（release.yml）

```yaml
- name: Download ffmpeg (Windows)
  if: matrix.os == 'windows-latest'
  shell: pwsh
  run: |
    $zip = "$env:TEMP\ffmpeg.zip"
    Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath "$env:TEMP\ffmpeg"
    $exe = Get-ChildItem -Path "$env:TEMP\ffmpeg" -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    $probe = Get-ChildItem -Path "$env:TEMP\ffmpeg" -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
    Copy-Item -Path $exe.FullName -Destination src-tauri\binaries\ffmpeg.exe
    Copy-Item -Path $probe.FullName -Destination src-tauri\binaries\ffprobe.exe

- name: Enable binaries resources (Windows)
  if: matrix.os == 'windows-latest'
  shell: pwsh
  run: |
    (Get-Content src-tauri\tauri.conf.json) -replace '"resources"\s*:\s*\[.*\]', '"resources": ["binaries/**"]' | Set-Content src-tauri\tauri.conf.json

- name: Build release bundles
  run: npm run tauri:build
```

**流れ：**
1. gyan.dev から ffmpeg-release-essentials.zip をダウンロード
2. ZIP を展開して `ffmpeg.exe` と `ffprobe.exe` を探す
3. `src-tauri/binaries/` にコピー
4. `tauri.conf.json` をパッチして `resources: ["binaries/**"]` を有効化
5. `npm run tauri:build` で MSI/NSIS インストーラを生成（ffmpeg 含む）

## 4. macOS 環境での注意点

### 4.1 Intel vs Apple Silicon

macOS では CPU アーキテクチャに応じて target triple が異なります：

```
Intel Mac (x86_64):       x86_64-apple-darwin
Apple Silicon (ARM64):    aarch64-apple-darwin
```

**release.yml での対応：**

```bash
if [ "$(uname)" = "Darwin" ]; then
  curl -L -o /tmp/ffmpeg.zip "https://evermeet.cx/ffmpeg/ffmpeg-6.1.zip"
  # → 通常は x86_64 向けが返される
  # → Apple Silicon で実行する場合、Rosetta 2 互換性層を通じて動作
fi
```

**注：** より正確には、target triple に応じてダウンロード URL を切り替えるべきですが、現在の実装では evermeet.cx が universal binary またはアーキテクチャ自動検出を提供していると想定されています。

## 5. Linux 環境での注意点

### 5.1 Glibc バージョン互換性

Linux の ffmpeg バイナリは特定の glibc バージョンに依存します。

```bash
# johnvansickle static build を使用（推奨）
# → 追加の依存関係なしで動作
curl -L -o /tmp/ff.tgz "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
```

**Static build の利点：**
- OS の glibc に依存しない
- 異なる Linux ディストリビューション間での互換性が高い
- CI 環境で予測可能なビルド

## 6. 「glob pattern binaries/** エラー」のトラブルシューティング

### 6.1 エラーの原因

```
glob pattern binaries/** path not found or didn't match any files.
```

このエラーは以下のいずれかの場合に発生します：

| 原因 | 対策 |
|---|---|
| `tauri.conf.json` で `"resources": ["binaries/**"]` が指定されているが、`src-tauri/binaries/` フォルダが存在しない | フォルダを作成: `mkdir -p src-tauri/binaries` |
| `src-tauri/binaries/` フォルダは存在するが、内部が空 | プレースホルダーバイナリを配置（空ファイルでは不十分） |
| CI で ffmpeg ダウンロードステップが失敗した | CI ログを確認し、ダウンロード URL の有効性をチェック |
| Windows パッチステップで regex が失敗した | `tauri.conf.json` の形式を確認（JSON 整形ツールで検証） |

### 6.2 ローカル開発時の推奨設定

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "resources": [],  // ← 空配列（本番環境では CI がパッチ）
    ...
  }
}
```

この設定で、Rust コードが ffmpeg を動的に探すため：
- `src-tauri/binaries/` が空でもビルド成功
- PATH に ffmpeg がある場合はそれを使用
- 開発効率が向上

### 6.3 外部バイナリが不要な場合

ffmpeg なしで基本機能を提供する場合：

```rust
// src-tauri/src/lib.rs 内
// 以下のコマンドを条件付きで実行するか、フェイルグレースに対応

#[cfg(feature = "ffmpeg_export")]
fn export_video_from_pngs(...) { ... }
```

設定ファイルをクリーンアップ：
```json
{
  "bundle": {
    "resources": []  // 外部バイナリなし
  }
}
```

## 7. CI での .gitignore 設定

### 7.1 推奨される .gitignore パターン

```gitignore
# 外部バイナリはリポジトリに含めない（CI でダウンロード）
src-tauri/binaries/ffmpeg*
src-tauri/binaries/ffprobe*
!src-tauri/binaries/*.txt     # ただしライセンス文書は含める

# Rust ビルド成果物
src-tauri/target/
src-tauri/.cargo/

# Node.js
node_modules/
dist/
```

### 7.2 CI での ffmpeg ダウンロード戦略

**Option A: 毎回ダウンロード（現在の実装）**
```yaml
- name: Download ffmpeg (Windows)
  run: |
    # CI 実行のたびに gyan.dev から新規ダウンロード
    # ネットワーク I/O あり、CI 時間が増加
```

**Option B: GitHub Actions Cache を使用（高速化）**
```yaml
- name: Cache ffmpeg
  uses: actions/cache@v3
  with:
    path: src-tauri/binaries
    key: ffmpeg-${{ runner.os }}-${{ env.FFMPEG_VERSION }}

- name: Download ffmpeg (if not cached)
  if: steps.cache.outputs.cache-hit != 'true'
  run: |
    # キャッシュがない場合のみダウンロード
```

## 8. ライセンス管理

### 8.1 ffmpeg のライセンス

ffmpeg は LGPL-2.1 ライセンスの下で配布されています。Project Ugomemo がバンドルする場合：

```
src-tauri/binaries/FFMPEG_LICENSE_NOTICE.txt
```

に以下を記載：
```
ffmpeg は LGPL-2.1 ライセンスの下で配布されています。
詳細は https://ffmpeg.org/legal.html を参照してください。
```

### 8.2 インストーラへの含有

`tauri.conf.json` の `resources` に含まれるすべてのファイルが最終パッケージに含まれるため、ライセンス文書もバンドルされます。ユーザーが「About」ダイアログ等で確認できる場所に記載することを推奨します。

## 9. 実装チェックリスト

- [ ] `src-tauri/binaries/` フォルダが存在する
- [ ] `tauri.conf.json` の `resources` が本番環境では空配列（開発環境では CI がパッチ）
- [ ] `src-tauri/src/lib.rs` に `ffmpeg_cmd()` / `ffprobe_cmd()` ロジックがある
- [ ] Windows / macOS / Linux それぞれで `.exe` / なし の拡張子が正しい
- [ ] `.github/workflows/release.yml` で platform ごとに ffmpeg をダウンロード
- [ ] `tauri.conf.json` をビルド前にパッチ（`resources: ["binaries/**"]` を有効化）
- [ ] `.gitignore` で `src-tauri/binaries/ffmpeg*` を除外
- [ ] ライセンス文書が `src-tauri/binaries/FFMPEG_LICENSE_NOTICE.txt` に存在
