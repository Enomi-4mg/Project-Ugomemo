# Project Ugomemo

「うごくメモ帳」風の、軽くて硬いピクセル描画・フレームアニメーションソフトです。Tauri + React + Rust 構成で、3レイヤー描画、最大999ページのフレーム管理、オニオンスキン、再生プレビュー、Audio Mode、`.upj`保存/読込、画像/動画/音声つき書き出しを持ちます。

## 機能

- 最大999ページのフレームアニメーション
- 初期プロジェクトは1ページ
- 各ページは3レイヤー構成: A / B / C
- レイヤーは上・中・下の順に A / B / C
- 各レイヤーに7段階のZ深さを設定可能
- 白・黒・赤・青・緑・黄の固定パレット
- 1レイヤーにつき描画色は2色まで
- 背景色は右側レイヤーUIから6色で選択
- ペン、トーン、消しゴム、シェイプ
- 描画ツールは Strategy Pattern と共通 `DrawingTool` インターフェースで実装
- UIアクションは `lucide-react` のSVGアイコンを中心に表示し、Draw ToolやExportなど識別性が必要な場所はアイコンと名前を併記する。各アイコンにはhover用の `title` と `aria-label` を付ける
- Tool Settings はアクティブなツールに必要な設定だけを表示
- Tool Settings はツールごとに保持し、Pen / Tone / Eraser / Shape を切り替えても前回値を復元
- Tone は Pen Mode と Bucket Fill Mode を別設定で操作
- Tool preview canvas はアクティブツールの設定変更をリアルタイム反映
- Shape は Line / Ellipse / Triangle / Rectangle、非Line図形のFill、Option/Shift修飾キーに対応
- Undo / Redo 最大20ステップ
- Undo / Redo は全ページ配列とページ編集操作を復元
- `Up` / `Down`: レイヤー移動
- `Left` / `Right`: ページ移動
- `Space`: Play / Stop切り替え
- `Option + Space` / `Alt + Space`: 選択中フレームから再生開始
- `Cmd/Ctrl + C` / `Cmd/Ctrl + V`: フレームまたはAudio Modeクリップのコピー/ペースト
- `Delete` / `Backspace`: Edit Modeの選択フレーム、またはAudio Modeの選択クリップを削除
- `T`: Tone、`E`: Eraser、`P`: Pen、`S`: Shape
- 最終ページで`Right`: 1回目は作成確認、2回目で新規ページ作成
- 先頭ページで`Left`: 1回目は先頭作成確認、2回目で新規ページを先頭に追加
- Edit Mode: ページ列、Clear / Copy / Paste / Duplicate / Insert New / Delete
- Cmd/Meta 押下中だけ、前後ページの同じレイヤーを薄く表示するオニオンスキン
- Playback Mode: プレビューキャンバス、ページ列、再生/停止、速度選択
- Project Config: root `fps`を`.upj`に保存し、Playback / Audio / Exportの標準同期クロックとして使用
- Playback Mode: 再生中/スクラブ中に現在ページが下部ページ列内へ自動スクロール
- Edit Mode: 実フレームのサムネイル付きページ列と、キーボード移動時の自動スクロール
- Audio Mode: 小型フレームプレビュー、Material Library、4トラックAudio Workstation、Recording、Mixer tab
- Audio Mode: 中央エリアはWorkstation / Mixerのタブ切り替え
- Audio Mode: FPSに基づく時間軸、Play/Pauseトグル、Stop 1回目で停止・2回目で先頭リセット
- Audio Mode: 固定/調整可能なpx/frame zoom、横スクロール、余白つきタイムラインで精密配置
- Audio Mode: ルーラーはFrames / Time表示を切り替え可能
- Audio Mode: Grid ON/OFFボタンでtimeline tickに対応する縦グリッド線を表示切替
- Audio Mode: `.mp3` / `.wav` / `.m4a`素材の追加、Rust側のduration/waveform検査、Tauri asset protocol経由の再生、録音、タイムラインへのドラッグ&ドロップ
- Audio Mode: Material Libraryヘッダーに追加（Plus）、Bundle、Recordを集約し、Recordingはモーダルで開く。Record modalはFormat、Mic、Count Down、Recordを各1行に分け、Record行にPause/Resumeを持つ。Snapはアイコンではなく`SNAP`表記でON/OFFを示す
- Workstation View: track headerはトラック名のみ表示し、double-clickでrename
- Mixer View: 各trackの長いvolume fader、数値volume input、meter、Mute、SoloとMaster meterを表示
- Audio Mode: 外部音声素材は`audioAssets`辞書で管理し、missing/offline素材は赤表示
- Audio Mode: Bundleで参照音声をプロジェクト横の`assets/`へコピーし、相対パス化してポータブル保存
- Audio Mode: 実素材尺に基づくドロップ位置プレビュー、project frame範囲を越える柔軟なtrim/loop編集
- Audio Mode: プレビューキャンバスは縦方向にフィットしつつ4:3比率を維持
- Audio Timeline: クリップの削除、複製、コピー/ペースト、分割、反転、ループ/トリム操作
- Audio Engine: Web Audio APIでタイムラインクリップをフレーム再生と同期し、track Gain / clip Gain / StereoPannerを構成
- Audio Mixer: Mixer tabのMute / Solo / Volumeは同じ`audioTracks` stateを更新し、リアルタイム再生と書き出しへ反映
- Audio Clip Mixing: volume / panning / fadeIn / fadeOut をクリップごとに調整
- `.upj` Persistence: 音声素材、録音、タイムラインクリップも保存/復元
- Image Export: 全フレームまたはチェックボックスで選んだ一部フレームをPNG/JPEG/WebP出力
- Export: 透過背景オプション、進捗表示、キャンセル
- File I/O Safety: Load / Save / Export中はブロッキングオーバーレイで操作を遮断
- Global Status: 動的ステータスを上部アクションバーに常時表示
- Video Export: Rust/TauriバックエンドからffmpegでMP4/WebM/GIF/APNG出力
- Video Export: タイムライン音声をWAVにミックスダウンし、MP4/WebMへ同期合成
- Export: Video Only、Audio Only (WAV)、WebM alpha/transparency向けVP9設定
- Export: Target FPS、output width/height、audio sample rateを上書き可能
- Export: Export modalにフレームペーシング確認用preview windowを表示
- Sprite Sheet Export: 全フレームを1枚のPNGスプライトシートとして出力
- 上部バーに常時表示されるページインジケーター
- New Project / Save / Load / Save As / Export / Undo / Redo の上部バーUIはアイコンボタンで表示
- Dirty状態では`Save *`とOSウィンドウタイトル末尾の`*`で未保存を表示
- Tauriネイティブ保存/読込ダイアログと`.upj`保存パッケージ構造

## 再生速度

| Speed | FPS | Seconds/Page |
| --- | ---: | ---: |
| 0 | 0.2 | 5.000 |
| 1 | 0.5 | 2.000 |
| 2 | 1 | 1.000 |
| 3 | 2 | 0.500 |
| 4 | 4 | 0.250 |
| 5 | 6 | 0.166 |
| 6 | 8 | 0.125 |
| 7 | 12 | 0.083 |
| 8 | 20 | 0.050 |
| 9 | 24 | 0.042 |
| 10 | 30 | 0.033 |

## ファイル構成

`sample_project` を保存すると、次の構成を作成します。

```text
Documents/Project Ugomemo/sample_project/
├── sample_project.upj
├── image/
├── movie/
└── record/
```

画像書き出しの既定先は `image/`、動画書き出しの既定先は `movie/`、録音ファイルの保存先は `record/` です。

## 描画ツール

Canvas Workstation は、共通インターフェースを持つ4種類の描画ツールを使います。

- Pen: Stroke Weight と round / square のストローク形状を持つ標準線描画
- Tone: Pen Mode ではパターン付きストローク、Bucket Fill Mode では領域拡張つきFlood Fillとトーンパターンを適用
- Eraser: `destination-out` によるリアルタイム消去で、ドラッグ中から対象レイヤーを透明化
- Shape: Line / Ellipse / Triangle / Rectangle を描画し、非Line図形はFillと修飾キー制約に対応

Shape は pointerDown 時に `getImageData()` でキャンバススナップショットを保持し、pointerMove ごとにプレビュー領域を復元してから現在のジオメトリを描き直します。Line は1回のドラッグで確定します。Triangle / Ellipse / Rectangle は2段階描画で、1段階目のドラッグで方向または主軸を決め、2段階目のクリックで底辺幅、副軸幅、または四角形の幅を決めます。2段階目の待機中は Tool Settings にフィードバックを表示し、キャンバス外クリックまたは Escape でキャンセルできます。

Shape の Option / Alt 修飾は描画中の押下状態を即時反映します。Line は15度刻みにスナップします。Triangle は1段階目の回転方向を15度刻みにスナップし、形状を正三角形に制約します。Rectangle も1段階目の回転方向を15度刻みにスナップし、形状を正方形に制約します。Ellipse は正円にスナップします。Option / Alt を離すと通常の描画に戻ります。Shift 押下中は、Ellipse / Triangle / Rectangle のFillを一時的に有効化します。Shift を離すと Fill ボタンの永続設定に戻ります。

Tone は Bucket Fill Mode で `getImageData()` ピクセルに対する独自Flood Fillを行い、アンチエイリアス境界の白抜けを抑えるために塗り領域を1-2px拡張します。その後、dot / line / noise のトーンパターンを `createPattern()` で繰り返し適用し、既存線画の背面へ `destination-over` で合成します。Pen Mode では同じ生成パターンをストローク塗料として使います。

Tone は dot / line / noise の3系統と Fine / Normal / Coarse の3段階を組み合わせた9種類のパターンを選択できます。

## プロジェクトファイル

`.upj` はzip形式です。`metadata.json` はプロジェクト設定、root `fps`、全フレーム、レイヤーPNGへのパスに加えて、Audio Modeの状態を保持します。

```text
sample_project.upj
├── metadata.json
└── frames/
    └── page-1/
        └── layers/
            ├── a.png
            ├── b.png
            └── c.png
```

Audio Mode persistence fields:

- `audioAssets`: 音声素材ID、名前、元パス、duration、waveform summary、offline状態
- `audioTracks`: track volume/mute/solo と non-destructive clip配列
- `audioMaterials`: 旧UI互換の読み込んだ外部音声素材のID、名前、パス、拡張子
- `recordings`: `record/`に保存された録音のID、名前、パス、拡張子
- `timelineClips`: track、startFrame、durationFrames、sourceOffsetFrames、loopCount、reversed、volume、panning、fadeInFrames、fadeOutFrames

## 現在の要件

- アプリUIは白とピンクを基調にし、選択状態は deep pink で統一する。
- 画面全体はビューポート内に収め、アプリ全体のスクロールを発生させない。
- 描画パレットは白・黒・赤・青・緑・黄の6色固定にする。
- 各レイヤーは6色から2色を割り当て、その2色だけで描画する。
- 各ページはA/B/Cの3レイヤーを持つ。
- ページ数上限は999。
- メイン描画モード、Edit Mode、Playback Modeを上部バーで切り替える。
- Playback Modeは大きなプレビューキャンバス、下部ページ列、Play / Pause / FPS Selectorを持つ。
- Audio Modeは小型プレビュー、素材列、Workstation/Mixerタブ、Record modal、4トラックタイムライン、Play/Pause/Stop/FPSを持つ。
- 全プレビューキャンバスは4:3比率を維持する。
- Cmd/Meta押下中のみオニオンスキンを表示する。
- ExportはImage Export / Video Exportのタブ、preview window、advanced overridesを持つ。
- Export設定ダイアログ表示中は背景UIを操作できない。
- Image ExportはAll Frames / Select Partial Framesを切り替える。
- PNG書き出しはTransparent Backgroundを有効にすると背景色を描画せずalphaを保持する。
- MP4 / WebM / GIF / APNG動画書き出しにはローカル環境の`ffmpeg`を使う。
- MP4 / WebMはAudio Modeのタイムライン音声を含めて出力できる。
- Audio Only (WAV)はタイムラインのOfflineAudioContextミックスだけを書き出す。
- Target FPS、Image Resolution、Audio Sample RateはExportごとに上書きできる。
- Sprite SheetはPNGとして出力する。
- Saveは現在の`.upj`へ直接上書きし、Save AsはOSネイティブダイアログを開く。
- LoadはOSネイティブダイアログから`.upj`を選択し、全ページ、全PNGレイヤー、Audio Mode状態を復元する。
- Load / Save / Export中はアプリ全体への入力をブロックする。
- OSウィンドウタイトルは`Project Ugomemo - [filename].upj`、未保存時は末尾に`*`を付ける。

## 書き出しメモ

- MP4 / WebM / GIF / APNG の書き出しには、`PATH` 上の `ffmpeg` が必要です。
- 書き出し進捗はモーダル内に表示し、Cancel でフレーム描画を中断、または実行中の ffmpeg プロセスを停止します。
- GIF / APNG は音声を含みません。MP4 / WebM は Video Only が有効でない限り、Audio Mode のタイムラインミックスを含めます。
- Audio Only (WAV) は動画フレームを描画せず、タイムラインミックスだけを書き出します。

## 実行

主要なフロントエンド依存は React、Tauri API、Vite、TypeScript、SVGアイコン用の `lucide-react` です。

```bash
npm install
npm run tauri:dev
```

Webだけで確認する場合:

```bash
npm install
npm run dev
```

## Windows対応とCI

## リリース手順とトリガ（詳細）

このリポジトリの自動ビルドは 2 種類のワークフローで動きます。

- CI (検証): `pull_request` と `push`（`main` ブランチ）で発火します。
    - 実行内容: `npm ci` → `npm run build`（フロントエンド）および `cargo check --manifest-path src-tauri/Cargo.toml`（バックエンド）を macOS/Windows 上で検証します。
    - 目的: PR や main への変更でビルドが壊れていないかを早期に検出すること。

- Release Build: `push` のうちタグ名が `v*`（例: `v1.0.0`）のときに発火します。
    - 実行内容: CI の検証に加え、`npm run tauri:build` でプラットフォーム向けのバンドルを生成します（現在は Windows 向けのマトリクスで `src-tauri/target/release/bundle/` 以下の成果物を収集します）。
    - 生成される成果物例: `msi`, `nsis` (`.exe`), あるいは zip など、Tauri のバンドル出力全体。
    - ワークフローはタグ push を検出して起動するため、GitHub の Release 作成操作（UI でのリリース作成）以前にタグを push するか、`gh` コマンドや `git` でタグを作成して push してください。

注意点:

- ワークフローは現在、タグ名プレフィックス `v` にマッチするもののみをリリースビルドとして扱います（例: `v0.3.1`）。
- Release ワークフローはリリースオブジェクト自体を自動で作成しません。Actions の成果物はワークフロー実行のアーティファクトとして保存されます。必要であれば、後段で `gh release create` や `actions/create-release` を追加して GitHub Release に自動で添付できます。
- バイナリは `src-tauri/target/release/bundle/` 以下に出力されます。ワークフローはこのパスをまとめてアップロードします。
- `ffmpeg` 等の外部ツールは local の書き出しで必要です。CI がこれらを必要とする場合は、ワークフローに `ffmpeg` のインストールステップを追加してください。

ローカルでのリリース用ビルド手順（推奨）:

```bash
# 依存をインストール
npm ci

# フロントエンドのビルド（dist を生成）
npm run build

# Tauri のリリースバンドルを生成（プラットフォームのツールチェインが必要）
npm run tauri:build
```

タグを作ってリリースビルドをトリガする方法:

```bash
# バージョンを package.json と src-tauri/Cargo.toml に反映してコミット
git add package.json src-tauri/Cargo.toml
git commit -m "Bump version to vX.Y.Z"

# タグ作成（例）
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

または GitHub CLI を使う例:

```bash
# タグと GitHub リリースを同時に作る（ローカルでビルド済みの成果物を手動でアップロードする場合）
gh release create v1.0.0 --title "v1.0.0" --notes "Release v1.0.0"
```

ワークフロー発火条件の要約:

- PR の作成/更新 → CI が macOS/Windows で走る（検証）
- `push` が `main` へ → CI（検証）が走る
- `git push origin v*`（タグ push）→ Release Build ワークフローが走り、バイナリを生成してアーティファクトとしてアップロードする

リリース前チェックリスト:

1. `package.json` と `src-tauri/Cargo.toml` のバージョン番号を更新する
2. 依存のインストールとローカルビルドが通ることを確認する（`npm run build` / `cargo build --release`）
3. 必要なら `ffmpeg` 等の外部ツールが利用可能か確認する
4. タグを作って `git push origin <tag>` する

必要なら、Release ワークフローに GitHub Release の自動作成・アセット添付を追加します。ご希望なら次で自動リリース化を実装します。

## ffmpeg バンドルとライセンス

- リリースビルドでは、必要に応じて `ffmpeg` / `ffprobe` のスタティックビルドを CI 上でダウンロードし、`src-tauri/binaries/` に配置して Tauri の `resources` としてパッケージに含めます。
- ランタイムでは優先順位は次の通りです:
    1. 環境変数 `UGOMEMO_FFMPEG_PATH` / `UGOMEMO_FFPROBE_PATH` に指定されたパス
    2. アプリケーションバンドル内の `binaries/ffmpeg(.exe)` / `binaries/ffprobe(.exe)`（インストーラに含めた場合）
    3. システム `PATH` 上の `ffmpeg` / `ffprobe`
- CI の Release ワークフローはタグ push 時にのみ `src-tauri/binaries/` を生成して `tauri build` を実行します。ローカル開発中は `ffmpeg` がローカル環境にインストールされていることを期待します。
- ライセンス: `ffmpeg` はビルド構成により LGPL または GPL に該当します。配布バイナリに同梱するライセンス/NOTICE ファイルはリリースアーティファクトに含めています。

ローカルでバンドルされた `ffmpeg` をテストしたい場合は、`src-tauri/binaries/` に実行可能な `ffmpeg` / `ffprobe` バイナリを置くか、環境変数でパスを指定してから `npm run tauri:build` を実行してください。


## ドキュメント

- [設計書](./docs/DESIGN.md)
# Project-Ugomemo
