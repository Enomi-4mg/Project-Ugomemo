# Project Ugomemo

「うごくメモ帳」風の、軽くて硬いピクセル描画・フレームアニメーションソフトです。Tauri + React + Rust 構成で、3レイヤー描画、最大999ページのフレーム管理、オニオンスキン、再生プレビュー、Audio Mode、`.upj`保存/読込、画像/動画/音声つき書き出しを持ちます。

## 目次

- [機能概要](#機能概要)
- [基本仕様](#基本仕様)
- [モード](#モード)
- [描画ツール](#描画ツール)
- [ショートカット](#ショートカット)
- [再生速度](#再生速度)
- [保存形式とファイル構成](#保存形式とファイル構成)
- [Assets の追加と PNG 要件](#assets-の追加と-png-要件)
- [書き出し](#書き出し)
- [現在の要件](#現在の要件)
- [実行](#実行)
- [Windows対応とCI](#windows対応とci)
- [リリース手順とトリガ](#リリース手順とトリガ)
- [ffmpeg バンドルとライセンス](#ffmpeg-バンドルとライセンス)
- [ドキュメント](#ドキュメント)

## 機能概要

- 最大999ページのフレームアニメーションを作成できます。
- 初期プロジェクトは1ページです。
- 各ページはA / B / Cの3レイヤー構成です。
- レイヤーは上・中・下の順に A / B / C です。
- 各レイヤーに7段階のZ深さを設定できます。
- 白・黒・赤・青・緑・黄の固定パレットを使います。
- 1レイヤーにつき描画色は2色までです。
- 背景色は右側レイヤーUIから6色で選択します。
- ペン、ブラシ、トーン、消しゴム、シェイプを使えます。
- Undo / Redo は最大20ステップです。
- Undo / Redo は全ページ配列とページ編集操作を復元します。
- `.upj`保存/読込、画像/動画/音声つき書き出しに対応します。
- Tauriネイティブ保存/読込ダイアログと`.upj`保存パッケージ構造を使います。

## 基本仕様

### プロジェクトと表示

- Project Configのroot `fps`を`.upj`に保存し、Playback / Audio / Exportの標準同期クロックとして使います。
- Draw / Playback / Audio Modeのキャンバス表示は`project.width / project.height`を基準にcontain-styleで最大フィットし、内部解像度を変えずに縦横比を維持します。
- 全プレビューキャンバスは4:3比率を維持します。
- 画面全体はビューポート内に収め、アプリ全体のスクロールを発生させません。
- 上部バーにページインジケーターを常時表示します。
- Global Statusは上部アクションバーに常時表示します。
- Dirty状態では`Save *`とOSウィンドウタイトル末尾の`*`で未保存を表示します。

### UI

- アプリUIは白とピンクを基調にし、選択状態はdeep pinkで統一します。
- UIアクションは`lucide-react`のSVGアイコンを中心に表示します。
- Draw ToolやExportなど識別性が必要な場所はアイコンと名前を併記します。
- 主要ボタンにはhover用の`title`と`aria-label`で操作名とショートカットを表示します。
- New Project / Save / Load / Save As / Export / Undo / Redo の上部バーUIはアイコンボタンで表示します。
- File I/O Safetyとして、Load / Save / Export中はブロッキングオーバーレイで操作を遮断します。

## モード

### Draw Mode

- メイン描画モード、Edit Mode、Playback Mode、Audio Modeは上部バーで切り替えます。
- Draw Modeでは描画ツール、レイヤー、背景、Z深さ、レイヤーClearを操作します。
- プラットフォームごとの主修飾キー押下中だけ、前後ページの同じレイヤーを薄く表示するオニオンスキンを使います。
- macOSではCommand、Windows / LinuxではCtrl押下中のみオニオンスキンを表示します。

### Edit Mode

- 実フレームのサムネイル付きページ列を表示します。
- キーボード移動時にページ列を自動スクロールします。
- 選択フレームに対してClear / Copy / Paste / Duplicate / Insert New / Deleteを実行できます。

### Playback Mode

- 大きなプレビューキャンバス、下部ページ列、再生/停止、Play / Pause、FPS Selector、速度選択を持ちます。
- 再生中またはスクラブ中に、現在ページが下部ページ列内へ自動スクロールします。
- `Space`でPlay / Stopを切り替えます。
- `Option + Space` / `Alt + Space`で選択中フレームから再生開始します。

### Audio Mode

- 小型フレームプレビュー、Material Library、4トラックAudio Workstation、Recording、Mixer tabを持ちます。
- 中央エリアはWorkstation / Mixerのタブで切り替えます。
- FPSに基づく時間軸、Play/Pauseトグル、Stopを持ちます。
- Stopは1回目で停止し、停止状態でもう一度押すと先頭へリセットします。
- 固定/調整可能なpx/frame zoom、横スクロール、余白つきタイムラインで精密配置できます。
- ルーラーはFrames / Time表示を切り替えられます。
- Grid ON/OFFボタンでtimeline tickに対応する縦グリッド線を表示切替します。
- `.mp3` / `.wav` / `.m4a`素材を追加できます。
- 音声素材はRust側でduration/waveformを検査し、Tauri asset protocol経由で再生します。
- 録音と、タイムラインへのドラッグ&ドロップに対応します。
- Material Libraryヘッダーに追加（Plus）、Bundle、Recordを集約します。
- Recordingはモーダルで開きます。
- Record modalはFormat、Mic、Count Down、Recordを各1行に分け、Record行にPause/Resumeを持ちます。
- Snapはアイコンではなく`SNAP`表記でON/OFFを示します。
- 外部音声素材は`audioAssets`辞書で管理し、missing/offline素材は赤表示します。
- Bundleで参照音声をプロジェクト横の`assets/`へコピーし、相対パス化してポータブル保存します。
- 実素材尺に基づくドロップ位置プレビューを表示します。
- project frame範囲を越える柔軟なtrim/loop編集ができます。
- Snapは編集補助であり、off-snapの音声クリップ位置も保存できます。
- フレームプレビューはDraw Modeと同じcontain-styleフィットを使い、プロジェクト解像度由来の縦横比を維持します。

### Audio Timeline

- クリップの削除、複製、コピー/ペースト、分割、反転、ループ/トリム操作に対応します。
- Web Audio APIでタイムラインクリップをフレーム再生と同期します。
- Audio Engineはtrack Gain / clip Gain / StereoPannerを構成します。
- Audio Clip Mixingではvolume / panning / fadeIn / fadeOutをクリップごとに調整できます。
- Audio MixerのMute / Solo / Volumeは同じ`audioTracks` stateを更新し、リアルタイム再生と書き出しへ反映します。
- Workstation Viewのtrack headerはトラック名のみ表示し、double-clickでrenameできます。
- Mixer Viewでは各trackの長いvolume fader、数値volume input、meter、Mute、SoloとMaster meterを表示します。
- `.upj` Persistenceとして、音声素材、録音、タイムラインクリップも保存/復元します。

## 描画ツール

Canvas Workstation は、共通インターフェースを持つ5種類の描画ツールを使います。描画ツールはStrategy Patternと共通`DrawingTool`インターフェースで実装します。

### Tool Settings

- Tool Settingsはアクティブなツールに必要な設定だけを表示します。
- Tool Settingsはツールごとに保持し、Pen / Brush / Tone / Eraser / Shapeを切り替えても前回値を復元します。
- Tool preview canvasはアクティブツールの設定変更をリアルタイム反映します。
- 描画色はアクティブレイヤーの色スロットに同期するため、Tool Settingsの保存対象から外します。

### Pen

- Stroke Weightとround / squareのストローク形状を持つ標準線描画です。
- ポインタ移動を補間した位置へ明示的な形状マスクをスタンプします。
- roundは円形マスク、squareは矩形マスクとして描きます。
- Stroke Weightはプロジェクトピクセル単位で扱います。
- 画面ズームやCSSスケールには依存しません。
- ドラッグ中のpointer座標を補間し、`src/drawing/strokeShapes/`のshape registryから取得したマスクをアクティブレイヤーへ書き込みます。
- アンチエイリアスはマスク生成時のalphaで決まります。
- OFFでは硬い二値alpha、ONではエッジに部分alphaを持つため、round / squareの差がキャンバスstroke設定に左右されません。
- Penは線画・下描き向けに軽量で予測しやすい挙動を優先します。

### Brush

- 反復スタンプを使う表現向け描画です。
- Spacingはブラシサイズに対するスタンプ間隔の割合として扱います。
- Scatterはブラシサイズに対するランダムオフセット量として扱います。
- `src/drawing/brush/`のstamp-based engineを使います。
- Spacing 25%ならブラシサイズ20pxで5pxごとにスタンプを置きます。
- Scatter 50%ならブラシサイズ20pxで最大10pxまでストローク軸からずらします。
- Scatterはseeded randomを使うため、同じストロークは再描画しても同じ結果になります。
- Brush内部ではPenの`penShape`とは別に`brushTipId`を扱い、round / square / built-in bitmap tipsを選択できます。
- Built-in bitmap brush tipsはPNGのalpha channelだけを`StampMask`へ変換します。RGB channelは描画色や濃度に影響しません。
- Brushはfixed / stroke-direction / deterministic random rotation、rotation jitter、scale jitter、per-brush smoothingを持ちます。opacity、flow、pressure responseは未対応です。
- Bitmap Brush Tip定義は将来のpreset用に`maskSourceMode`を指定でき、未指定時は従来通り`alpha`を使います。
- Desktop appではPNG Brush Tipをimportできます。画像はapp-managed brush libraryへコピーされ、Brush Tip selectorから選択できます。
- `.upj`保存時はprojectにattachedされたcustom Brush Tip PNGだけを`assets/brushes/`へ同梱し、別環境で再編集できるようにします。
- Brush PresetはBrush Tipとは別に、tipId、size、spacing、scatter、rotation、jitter、smoothingなどの描画挙動を保存します。
- Stamp renderingはdirty rectangleだけを`ImageData`更新し、full-canvas更新を避けます。

### Tone

- Pen ModeとBucket Fill Modeを別設定で操作します。
- Tool SettingsはTone Mode、Pattern、Scale、Densityを分けて表示し、Tone PenとTone Bucketを切り替えます。
- Pen Modeではshape maskとプロジェクト座標に固定されたtone patternを掛け合わせるパターン付きストロークを描画します。
- Pen ModeではBrushと同じstamp rendererを使い、`shapeAlpha × patternAlpha`で描画します。
- patternAlphaはプロジェクト座標から直接サンプリングするため、ストローク中に柄が泳ぎません。
- Bucket Fill Modeでは`getImageData()`ピクセルに対する独自Flood Fillを行います。
- アンチエイリアス境界の白抜けを抑えるために塗り領域を1-2px拡張します。
- dot / line / noiseのトーンパターンを`createPattern()`で繰り返し適用し、既存線画の背面へ`destination-over`で合成します。
- Patternはdot / line / noise、ScaleはFine / Normal / Coarse、Densityは濃度を調整します。
- 内部的には`dot-small`、`dot-medium`、`dot-large`、`line-small`、`line-medium`、`line-large`、`noise-small`、`noise-medium`、`noise-large`の`tonePattern`値を使います。
- 保存済みプロジェクトとの互換性を維持します。

### Eraser

- `destination-out`によるリアルタイム消去で、ドラッグ中から対象レイヤーを透明化します。

### Shape

- Line / Ellipse / Triangle / Rectangleを描画します。
- 非Line図形はFillと修飾キー制約に対応します。
- pointerDown時に`getImageData()`でキャンバススナップショットを保持します。
- pointerMoveごとにプレビュー領域を復元してから現在のジオメトリを描き直します。
- Lineは1回のドラッグで確定します。
- Triangle / Ellipse / Rectangleは2段階描画です。
- 1段階目のドラッグで方向または主軸を決め、2段階目のクリックで底辺幅、副軸幅、または四角形の幅を決めます。
- 2段階目の待機中はTool Settingsにフィードバックを表示し、キャンバス外クリックまたはEscapeでキャンセルできます。
- Option / Alt修飾は描画中の押下状態を即時反映します。
- Lineは15度刻みにスナップします。
- Triangleは1段階目の回転方向を15度刻みにスナップし、形状を正三角形に制約します。
- Rectangleも1段階目の回転方向を15度刻みにスナップし、形状を正方形に制約します。
- Ellipseは正円にスナップします。
- Option / Altを離すと通常の描画に戻ります。
- Shift押下中はEllipse / Triangle / RectangleのFillを一時的に有効化します。
- Shiftを離すとFillボタンの永続設定に戻ります。

## ショートカット

- クロスプラットフォームショートカットに対応します。
- macOSはCommand、Windows / LinuxはCtrlを主修飾キーとして使います。
- `Command + S` / `Command + Shift + S` (macOS) または `Ctrl + S` / `Ctrl + Shift + S` (Windows / Linux): Save / Save As
- `Command + C` / `Command + V` (macOS) または `Ctrl + C` / `Ctrl + V` (Windows / Linux): フレームまたはAudio Modeクリップのコピー/ペースト
- `Control + 1` / `Control + 2` / `Control + 3` / `Control + 4`: Draw / Edit / Playback / Audio Mode切り替え
- `Delete` / `Backspace`: Edit Modeの選択フレーム、またはAudio Modeの選択クリップを削除
- Draw Mode中の`Q`: Pen
- Draw Mode中の`W`: Brush
- Draw Mode中の`E`: Tone
- Draw Mode中の`R`: Eraser
- Draw Mode中の`T`: Shape
- `]`: Brush sizeを小さくする
- `[`: Brush sizeを大きくする
- `Up` / `Down`: レイヤー移動
- `Left` / `Right`: ページ移動
- 最終ページで`Right`: 1回目は作成確認、2回目で新規ページ作成
- 先頭ページで`Left`: 1回目は先頭作成確認、2回目で新規ページを先頭に追加

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

## 保存形式とファイル構成

`sample_project`を保存すると、次の構成を作成します。

```text
Documents/Project Ugomemo/sample_project/
├── sample_project.upj
├── assets/
├── image/
├── movie/
└── record/
```

- `assets/`: プロジェクトに同梱した外部素材の置き場です。
- `image/`: 画像書き出しの既定先です。
- `movie/`: 動画書き出しの既定先です。
- `record/`: 録音ファイルの保存先です。

`.upj`はzip形式です。`metadata.json`はプロジェクト設定、root `fps`、全フレーム、レイヤーPNGへのパス、Audio Modeの状態を保持します。

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

## Assets の追加と PNG 要件

### Assets の追加方法

- 音声素材はAudio ModeのMaterial LibraryでAddを押し、`.mp3` / `.wav` / `.m4a`を選択して追加します。
- プロジェクトを持ち運べる形にする場合は、保存後にMaterial LibraryのBundleを実行します。
- Bundleは参照中の外部音声をプロジェクト横の`assets/`へコピーし、`.upj`内の参照を相対パスへ書き換えます。
- 手動で素材を追加する場合は、プロジェクトディレクトリ直下の`assets/`へファイルを置きます。
- `.upj`の`metadata.json`では`assets/file-name.ext`のようなプロジェクト相対パスで参照します。
- `assets/`はユーザー素材用です。
- `.upj`内の`frames/**/layers/*.png`はアプリが管理するレイヤーデータです。
- レイヤーPNGを直接差し替える場合は、下記のPNG要件を満たしてください。

### PNG 要件

- レイヤーPNGはプロジェクトの`width` / `height`と完全に同じピクセル寸法にします。
- RGBA 8-bit PNGとして保存し、alphaを保持します。
- 透明部分はalpha 0で表現します。
- indexed color / palette PNG、アニメーションPNG、ICCやガンマ補正に依存する色変換前提のPNGは避けます。
- ピクセルアート用途では補間やアンチエイリアスで中間色を増やさず、固定パレットの白・黒・赤・青・緑・黄と透明を基本にします。
- ファイル名はASCIIの英数字、ハイフン、アンダースコアを推奨します。
- 同じ`assets/`内でファイル名を重複させないでください。

## 書き出し

### Image Export

- 全フレーム、またはチェックボックスで選んだ一部フレームをPNG/JPEG/WebPで出力します。
- All Frames / Select Partial Framesを切り替えます。
- Transparent Backgroundを有効にすると背景色を描画せずalphaを保持します。

### Video Export

- Rust/TauriバックエンドからffmpegでMP4/WebM/GIF/APNGを出力します。
- タイムライン音声をWAVにミックスダウンし、MP4/WebMへ同期合成します。
- Video Onlyに対応します。
- Audio Only (WAV)に対応します。
- WebM alpha/transparency向けVP9設定に対応します。
- Target FPS、output width/height、audio sample rateを上書きできます。
- Export modalにフレームペーシング確認用preview windowを表示します。
- Exportは透過背景オプション、進捗表示、キャンセルに対応します。
- Export設定ダイアログ表示中は背景UIを操作できません。
- MP4 / WebM / GIF / APNG動画書き出しにはローカル環境の`ffmpeg`を使います。
- GIF / APNGは音声を含みません。
- MP4 / WebMはVideo Onlyが有効でない限り、Audio Modeのタイムラインミックスを含めます。
- Audio Only (WAV)は動画フレームを描画せず、タイムラインミックスだけを書き出します。

### Sprite Sheet Export

- 全フレームを1枚のPNGスプライトシートとして出力します。
- Sprite SheetはPNGとして出力します。

## 現在の要件

- アプリUIは白とピンクを基調にし、選択状態はdeep pinkで統一する。
- 画面全体はビューポート内に収め、アプリ全体のスクロールを発生させない。
- 描画パレットは白・黒・赤・青・緑・黄の6色固定にする。
- 各レイヤーは6色から2色を割り当て、その2色だけで描画する。
- 各ページはA/B/Cの3レイヤーを持つ。
- ページ数上限は999。
- メイン描画モード、Edit Mode、Playback Modeを上部バーで切り替える。
- Playback Modeは大きなプレビューキャンバス、下部ページ列、Play / Pause / FPS Selectorを持つ。
- Audio Modeは小型プレビュー、素材列、Workstation/Mixerタブ、Record modal、4トラックタイムライン、Play/Pause/Stop/FPSを持つ。
- 全プレビューキャンバスは4:3比率を維持する。
- macOSはCommand、Windows / LinuxはCtrl押下中のみオニオンスキンを表示する。
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
- macOSはCommand + S / Command + Shift + S、Windows / LinuxはCtrl + S / Ctrl + Shift + SでSave / Save Asを実行できる。
- LoadはOSネイティブダイアログから`.upj`を選択し、全ページ、全PNGレイヤー、Audio Mode状態を復元する。
- 外部素材はAudio Modeから追加し、Bundleでプロジェクト横の`assets/`へコピーして相対パス化する。
- 手動追加時も`assets/`配下のプロジェクト相対パスで参照する。
- レイヤーPNGはRGBA 8-bit、プロジェクト寸法一致、alpha保持を必須とする。
- Load / Save / Export中はアプリ全体への入力をブロックする。
- OSウィンドウタイトルは`Project Ugomemo - [filename].upj`、未保存時は末尾に`*`を付ける。

## 実行

主要なフロントエンド依存はReact、Tauri API、Vite、TypeScript、SVGアイコン用の`lucide-react`です。

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

このリポジトリの自動ビルドはCIとRelease Buildの2種類のワークフローで動きます。

## リリース手順とトリガ

### CI

- `pull_request`と`push`（`main`ブランチ）で発火します。
- `npm ci`を実行します。
- `npm run build`でフロントエンドを検証します。
- `cargo check --manifest-path src-tauri/Cargo.toml`でバックエンドをmacOS/Windows上で検証します。
- PRやmainへの変更でビルドが壊れていないかを早期に検出します。

### Release Build

- `push`のうちタグ名が`v*`（例: `v1.0.0`）のときに発火します。
- CIの検証に加え、`npm run tauri:build`でプラットフォーム向けのバンドルを生成します。
- 現在はWindows向けのマトリクスで`src-tauri/target/release/bundle/`以下の成果物を収集します。
- 生成される成果物例は`msi`、`nsis`（`.exe`）、zipなど、Tauriのバンドル出力全体です。
- ワークフローはタグpushを検出して起動します。
- GitHubのRelease作成操作（UIでのリリース作成）以前にタグをpushするか、`gh`コマンドや`git`でタグを作成してpushしてください。

### 注意点

- ワークフローは現在、タグ名プレフィックス`v`にマッチするもののみをリリースビルドとして扱います。
- 例: `v0.3.1`
- Releaseワークフローはリリースオブジェクト自体を自動で作成しません。
- Actionsの成果物はワークフロー実行のアーティファクトとして保存されます。
- 必要であれば、後段で`gh release create`や`actions/create-release`を追加してGitHub Releaseに自動で添付できます。
- バイナリは`src-tauri/target/release/bundle/`以下に出力されます。
- ワークフローはこのパスをまとめてアップロードします。
- `ffmpeg`等の外部ツールはlocalの書き出しで必要です。
- CIがこれらを必要とする場合は、ワークフローに`ffmpeg`のインストールステップを追加してください。

### ローカルでのリリース用ビルド手順

```bash
# 依存をインストール
npm ci

# フロントエンドのビルド（dist を生成）
npm run build

# Tauri のリリースバンドルを生成（プラットフォームのツールチェインが必要）
npm run tauri:build
```

### タグを作ってリリースビルドをトリガする方法

```bash
# バージョンを package.json と src-tauri/Cargo.toml に反映してコミット
git add package.json src-tauri/Cargo.toml
git commit -m "Bump version to vX.Y.Z"

# タグ作成（例）
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

GitHub CLIを使う例:

```bash
# タグと GitHub リリースを同時に作る（ローカルでビルド済みの成果物を手動でアップロードする場合）
gh release create v1.0.0 --title "v1.0.0" --notes "Release v1.0.0"
```

### ワークフロー発火条件の要約

- PRの作成/更新: CIがmacOS/Windowsで走ります。
- `push`が`main`へ: CIが走ります。
- `git push origin v*`（タグpush）: Release Buildワークフローが走り、バイナリを生成してアーティファクトとしてアップロードします。

### リリース前チェックリスト

1. `package.json`と`src-tauri/Cargo.toml`のバージョン番号を更新する
2. 依存のインストールとローカルビルドが通ることを確認する（`npm run build` / `cargo build --release`）
3. 必要なら`ffmpeg`等の外部ツールが利用可能か確認する
4. タグを作って`git push origin <tag>`する

必要なら、ReleaseワークフローにGitHub Releaseの自動作成・アセット添付を追加します。

## ffmpeg バンドルとライセンス

- リリースビルドでは、必要に応じて`ffmpeg` / `ffprobe`のスタティックビルドをCI上でダウンロードします。
- ダウンロードしたバイナリは`src-tauri/binaries/`に配置し、Tauriの`resources`としてパッケージに含めます。
- CIのReleaseワークフローはタグpush時にのみ`src-tauri/binaries/`を生成して`tauri build`を実行します。
- ローカル開発中は`ffmpeg`がローカル環境にインストールされていることを期待します。
- ライセンス: `ffmpeg`はビルド構成によりLGPLまたはGPLに該当します。
- 配布バイナリに同梱するライセンス/NOTICEファイルはリリースアーティファクトに含めています。

ランタイムでの`ffmpeg` / `ffprobe`解決優先順位:

1. 環境変数`UGOMEMO_FFMPEG_PATH` / `UGOMEMO_FFPROBE_PATH`に指定されたパス
2. アプリケーションバンドル内の`binaries/ffmpeg(.exe)` / `binaries/ffprobe(.exe)`（インストーラに含めた場合）
3. システム`PATH`上の`ffmpeg` / `ffprobe`

ローカルでバンドルされた`ffmpeg`をテストしたい場合は、`src-tauri/binaries/`に実行可能な`ffmpeg` / `ffprobe`バイナリを置くか、環境変数でパスを指定してから`npm run tauri:build`を実行してください。

## ドキュメント

- [設計書](./docs/DESIGN.md)
