# Flipbook Studio / うごくノート

[![Deploy to GitHub Pages](https://github.com/grigory321/flipbook/actions/workflows/pages.yml/badge.svg)](https://github.com/grigory321/flipbook/actions/workflows/pages.yml)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue)](LICENSE)
![Runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![Languages: 5](https://img.shields.io/badge/languages-5-orange)


**Draw it. Flip it. — A browser-based flipbook animation studio that exchanges notes with Nintendo DSi (.ppm) and Nintendo 3DS (.kwz).**

**描いて、めくれば、動き出す。**
ブラウザで描けるパラパラマンガ制作スタジオ。ニンテンドーDSi（`.ppm`）とニンテンドー3DS（`.kwz`）の実機とも、そのままやり取りできます。

**[Open FlipBook](https://grigory321.github.io/flipbook/)** ·
[日本語](#日本語) ·
[Report a bug](https://github.com/grigory321/flipbook/issues)


Flipbook Studio is a drawing and animation app that lives in your browser. You draw on the pages of a notebook, flip through them, add sound, and press play — it feels a bit like doodling on a handheld console. It also opens and saves Flipnote Studio files, so a note can travel between FlipBook, a Nintendo DSi and a Nintendo 3DS.

Nothing to install, no account to make. Everything stays on your own device.

## Contents

- [What you can do](#what-you-can-do)
- [Getting started](#getting-started)
- [Note types](#note-types)
- [Drawing tools](#drawing-tools)
- [Pages and animation](#pages-and-animation)
- [Sound](#sound)
- [Text and pictures](#text-and-pictures)
- [Working with DSi and 3DS](#working-with-dsi-and-3ds)
- [Import and export](#import-and-export)
- [Controls](#controls)
- [Screen layouts](#screen-layouts)
- [Settings](#settings)
- [Browser support](#browser-support)
- [Privacy and storage](#privacy-and-storage)
- [Plugins](#plugins)
- [How it works](#how-it-works)
- [Development](#development)
- [Deploy your own copy](#deploy-your-own-copy)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)
- [Disclaimer](#disclaimer)
- [日本語](#日本語)

## What you can do

- **Draw** with your device's pen, pattern brushes, 19 art brushes (watercolor, charcoal, airbrush, neon and friends), shapes, fill and a pixel grid
- **Animate** up to 9999 pages, with onion skin, motion paths, wobble pages, and range edits like reverse, ping-pong and repeat
- **Add sound** on a timeline — 2 BGM tracks and 4 sound effect tracks, using ready-made sounds, your microphone, or audio files
- **Trade with real hardware**: open and save Flipnote Studio `.ppm` (DSi) and Flipnote Studio 3D `.kwz` (3DS)
- **Export** GIF, animated PNG, MP4 with sound, PNG image sets and WAV
- **Works offline** once you've opened it, and saves as you draw
- **Touch, stylus, mouse, keyboard and gamepad** all work, with layouts for phones, tablets and desktops
- **Five languages**: Japanese, English, Spanish, French and Russian
- **Plugins** can add tools, patterns, sounds, exporters, importers, commands and panels

## Getting started

1. Open **[grigory321.github.io/flipbook](https://grigory321.github.io/flipbook/)**.
2. Tap the title screen. The bookshelf opens with a sample note, _Bouncing ball_.
3. Tap **New note**, pick a note type, then a paper size and style.
4. Draw on the first page, then tap **Add** or the next-page arrow. Going past the last page adds a new one.
5. Press play. You can change the speed with the bar next to the page counter.
6. Tap **Export** to save a GIF, a video, or a file for your DSi or 3DS.

Your notes save themselves. To keep a copy or move a note to another device, use **Save to file** on the bookshelf — that writes a `.ugb` file.

## Note types

|              | Free note                                    | Flipnote (DSi)                                       | Flipnote 3D (3DS)                         |
| ------------ | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| Paper size   | 512×384, 640×360, 360×640, 480×480, 1280×720 | 256×192                                              | Same as Flipnote Studio 3D                |
| Pages        | Up to 9999                                   | Up to 999                                            | Up to 999                                 |
| Layers       | 1 to 8 (2 to start)                          | 2                                                    | 3                                         |
| Colors       | 12 pen colors you can change, 6 paper colors | Black or white, red and blue on white or black paper | White, black, red, yellow, green and blue |
| Paper style  | Plain, ruled, grid or dots                   | Plain                                                | Plain                                     |
| Speeds       | 8 steps from 0.5 to 30 frames per second     | 8 steps from 0.5 to 30 frames per second             | 11 steps from 0.2 to 30 frames per second |
| Sound length | No device limit                              | BGM about 60 s, effects about 2 s (8 kHz)            | BGM 60 s, effects 2 s (16 kHz)            |
| Trades with  | Other FlipBook users (`.ugb`)                | Flipnote Studio (`.ppm`)                             | Flipnote Studio 3D (`.kwz`)               |

Flipnote and Flipnote 3D notes follow the console's own rules, so what you draw is what the console will show. Any note can still be exported to `.ppm` or `.kwz` — a free note simply gets converted to the console's colors and size.

## Drawing tools

| Tool        | Key | What it does                                                                                 |
| ----------- | :-: | -------------------------------------------------------------------------------------------- |
| Pen         |  P  | Draw lines. Pick a pen tip, size, opacity, line style and drawing feel                       |
| Pattern     |  B  | Paint with a pattern using a small, medium or large brush, or a bucket                       |
| Eraser      |  E  | Erase with a dot, square, round, vertical or horizontal tip, or only the dots of a pattern   |
| Fill        |  F  | Fill an area closed by lines with the current color                                          |
| Shape       |  L  | Lines, boxes, circles and 18 more shapes, filled or outlined, plus shapes you trace yourself |
| Select      |  S  | Pick by box, lasso or connected lines, then move, rotate, flip, resize or warp the corners   |
| Text        |  T  | Place text with your own fonts, vertical writing and outlines                                |
| Picture     |     | Turn a picture into dots on the page                                                         |
| Pixels      |  G  | Paint on a grid of squares. Starting on a square of the same color erases                     |
| Move        |  M  | Move everything on the current layer, with handles for size and angle                        |
| Warp        |     | Push, swell or pinch the drawing                                                              |
| Motion path |     | Trace a route and FlipBook draws the pages that follow it                                     |
| Picker      |  I  | Take a color from the page (free notes)                                                       |

The first six sit on the tool rail. The rest are tucked under **More**.

**Pencil cases.** Pens come in three boxes:

- **Basic**: the console's pen tips in Flipnote notes; round pen, ink pen, brush, felt pen and square pen in free notes
- **Advanced** (Flipnote notes): the console's advanced pens, such as thicker pens, brush, outline and the wide versions of spray and crayon
- **Art**: pencil, color pencil, crayon, chalk, charcoal, pastel, watercolor, airbrush, marker, highlighter, nib pen, ribbon, neon, spray, stipple, splatter, dots, sparkles and hearts

Under **Drawing feel** in the pen panel, **Pressure changes width** follows a stylus, and **Smooth lines** evens out strokes. **Line smoothing** in Settings decides how strongly shaky hands get steadied. In Flipnote notes, turning off the **Advanced pencil case** in Note settings makes the layer switch for you when you pick a color, just like on the console.

**Selection.** Once you've picked part of a drawing, you can copy it, stamp it again and again, delete it, save it as your own shape or pattern, or go back and edit text you placed earlier.

**Patterns.** FlipBook comes with the console's patterns. A plugin included with the app adds eight more (sand, waves, bricks, stars, hearts, scales, rain and flowers), and you can switch it off in Settings. You can also draw your own 8×8 pattern.

## Pages and animation

- **Page strip**: every page shown as a film frame. Long-press a page and drag it to reorder.
- **Page menu**: duplicate to the next page, copy and paste, clear a layer, delete a page, add several pages at once, jump to a page.
- **Onion skin**: show the previous and next pages faintly. Choose how many in Settings.
- **Edit a range**: pick a range of pages and reverse it, ping-pong it, repeat it, stretch it or delete it.
- **Wobble pages**: make slightly shaken copies of a page so the lines shimmer. Choose lines only or the whole drawing, the strength, and how many pages to add.
- **Motion path**: trace a route, then pick how many pages, the pace (even, speed up, slow down, smooth), the final size, and whether the drawing turns with the path. FlipBook can add new pages or draw onto the pages that follow.
- **Layers**: show or hide, lock, reorder, and in free notes add or remove layers. Change the paper color for one page or for all of them.
- **Playback**: play, loop, and pick one of the speeds for the note.

## Sound

Open the **sound rows** under the page strip. Every note has two BGM tracks and four sound effect tracks.

- Tap a row to pick a sound: 8 ready-made sounds (Pop, Boing, Sparkle, Coin, Jump, Thud, Whoosh, Ding), a recording from the microphone, or an audio file.
- Slide a sound along the row to choose the page it plays on. Drag its end to change how long it lasts.
- Each track has its own volume and mute.
- A sound keeps the speed it was placed at. If you change the playback speed later, the sound speeds up or slows down along with the animation.

## Text and pictures

**Text** can use the built-in round, sans, serif and handwriting fonts, font files you add yourself, and — in Chromium browsers — the fonts already on your device. It can be bold or vertical, and can have an outline or a hollow style, with colors of its own. **Erase what is below** cuts the text out of the drawing underneath. Text stays editable after you place it.

**Pictures** become dots on the page as halftone, line art or color. You can set the darkness, size and dithering before placing.

## Working with DSi and 3DS

**From the console to FlipBook.** Copy a `.ppm` (DSi) or `.kwz` (3DS) file off the SD card and open it with **File** on the bookshelf. Pages, layers, colors, speed and sound all come with it.

**From FlipBook to the console.** Choose **To DSi (.ppm)** or **To 3DS (.kwz)** in **Export**, then copy the file to the SD card folder where Flipnote Studio keeps its notes.

- Files for the console are signed, and signing needs a secure page — so open FlipBook over HTTPS (as on GitHub Pages) or on `localhost`. If the page isn't secure, FlipBook warns you that the console won't accept the file.
- Before you save, the export screen tells you what will change:
  - whether the picture is kept as it is, or colors and size get converted
  - whether sounds that didn't fit were dropped
  - whether the note is bigger than the console can open
  - whether the console will have room to keep drawing in this note

## Import and export

| Format                        | Import | Export | Notes                                            |
| ----------------------------- | :----: | :----: | ------------------------------------------------ |
| `.ugb` (FlipBook note)        |   ✓    |   ✓    | Everything, so you can keep drawing later        |
| `.ppm` (Flipnote Studio, DSi) |   ✓    |   ✓    | Signed for the console                           |
| `.kwz` (Flipnote Studio 3D)   |   ✓    |   ✓    | Signed for the console                           |
| GIF                           |        |   ✓    | 1×, 2×, 4× or 8× size                            |
| Animated PNG                  |        |   ✓    | Full colors. 1×, 2×, 4× or 8× size               |
| Image set (.zip)              |        |   ✓    | One PNG per page. 1×, 2×, 4× or 8× size          |
| Video (.mp4)                  |        |   ✓    | With sound. Shown when the browser has WebCodecs |
| Audio (.wav)                  |        |   ✓    | Sound only                                       |
| PNG of the current page       |        |   ✓    | From the export screen                           |

Exports run in the background, so the editor stays responsive while they work.

## Controls

### Touch and stylus

| Gesture                        | Action                |
| ------------------------------ | --------------------- |
| Draw with a finger or stylus   | Draw                  |
| Tap with two fingers           | Undo                  |
| Tap with three fingers         | Redo                  |
| Pinch with two fingers         | Zoom                  |
| Drag with two fingers          | Move the paper        |
| Long-press a page in the strip | Drag to reorder       |
| Slide a sound in a sound row   | Change where it plays |

### Keyboard

| Key                          | Action                             |
| ---------------------------- | ---------------------------------- |
| ← → or Q W or Page Up/Down   | Turn the page                      |
| Enter                        | Play or stop                       |
| N                            | Add a page                         |
| D                            | Duplicate the page                 |
| Delete                       | Delete the page                    |
| O                            | Onion skin                         |
| P B E F L S M T G I          | Pick a tool                        |
| Ctrl + Z                     | Undo                               |
| Ctrl + Y or Ctrl + Shift + Z | Redo                               |
| Ctrl + C / X / V             | Copy, cut, paste                   |
| Ctrl + A                     | Select everything on the layer     |
| ↑ ↓ ← →                      | Nudge the selection (Shift for 10) |
| Enter / Esc                  | Place or cancel the selection      |
| Space + drag                 | Move the paper                     |
| 0                            | Fit the paper to the screen        |
| H                            | Fold or show the side panel        |
| Z / X                        | Select / back in menus             |

On a Mac, use Cmd instead of Ctrl.

### Gamepad

A standard gamepad works like the keyboard:

| Button             | Same as        | Action                           |
| ------------------ | -------------- | -------------------------------- |
| D-pad              | Arrow keys     | Move between buttons, turn pages |
| Bottom face button | Enter          | Select, or play in the editor    |
| Right face button  | Esc            | Back                             |
| L / R              | Page Up / Down | Turn the page                    |
| Start              |                | Play or stop                     |

The on-screen guide changes to match whatever you're using: keys, buttons or finger gestures.

## Screen layouts

FlipBook picks a layout from the screen size:

- **Desktop**: tools on the left, the pen and layer panel on the right. Fold the panel with the button in the top bar or <kbd>H</kbd>; it starts folded.
- **Tablet**: tools and panels become tabs on the screen edges, so the paper gets the full width.
- **Phone, portrait**: tools sit in one row at the bottom.
- **Phone, landscape**: one bar at the bottom, and the paper at full height.

When the screen is short, the tool buttons shrink, then show icons only. Tools that still don't fit move into **More**. The **left-handed** setting mirrors the whole layout.

## Settings

- **Language**: match your device, or pick one of the five languages
- **Sound and motion**: menu sounds, page-turn sounds, drawing and erasing sounds, volume, skip the title screen
- **Drawing**: how strongly line smoothing steadies your hand
- **Main hand**: right or left. Left mirrors the editor
- **Nearby pages**: how many previous and next pages onion skin shows
- **Plugins**: turn plugins on or off, and load new ones

## Browser support

FlipBook is developed and tested in Chromium browsers (Chrome, Edge). Other current browsers should work fine. When a browser is missing a feature, FlipBook either hides that option or finds another way.

| Feature                 | Needs                                 | Without it                           |
| ----------------------- | ------------------------------------- | ------------------------------------ |
| Saving notes            | IndexedDB                             | Notes can't be kept                  |
| Background work         | Web Workers                           | Runs on the page instead             |
| `.ugb` and animated PNG | Compression Streams                   | Not available                        |
| MP4 export              | WebCodecs                             | The MP4 option is hidden             |
| Fonts on this device    | Local Font Access (Chromium, desktop) | Built-in and added fonts only        |
| Recording               | Microphone permission                 | Ready-made sounds and files only     |
| Files for DSi and 3DS   | HTTPS or `localhost` (Web Crypto)     | Files aren't signed, with a warning  |
| Offline use             | Service Worker over HTTPS             | Needs the network to open            |

## Privacy and storage

FlipBook has no server, no account, no analytics and no ads. Apart from loading the app itself, it doesn't send anything anywhere.

- Notes live in your browser (IndexedDB database `flipbook`). Fonts you add go in `flipbook-fonts`. Settings and plugins are kept in `localStorage`.
- Clearing site data for the page deletes your notes. Use **Save to file** for backups.
- Notes don't sync between browsers or devices. Move them with `.ugb` files.

## Plugins

A plugin is a single JavaScript module. Load one from **Settings → Plugins → Load a plugin**. FlipBook remembers it and loads it every time; you can turn it off in the same place.

> [!WARNING]
> A plugin runs with the same rights as FlipBook itself. Only load plugins you trust.

```js
export default {
  id: 'my.plugin',
  name: 'My plugin',
  version: '1.0.0',
  description: 'Shows the page count',

  setup(api) {
    api.commands.register({
      id: 'my.count',
      name: 'Count pages',
      icon: 'pages',
      run(editor) {
        api.toast(`${editor.pageCount} pages`)
      },
    })

    api.on('page-change', editor => {
      console.log('now on page', editor?.page.peek())
    })
  },
}
```

`setup` may return a function, which runs when the plugin is turned off. A complete example with a tool, a pattern, a command and a panel is in [`plugins/stamp-pack.js`](plugins/stamp-pack.js).

| `api` member                      | Use                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `tools.register(tool)`            | A drawing tool with `down`, `move` and `up` handlers                              |
| `patterns.register(pattern)`      | A pattern: `{ id, name, width, height, bits }`                                    |
| `sounds.register(sound)`          | A ready-made sound: `{ id, name, seconds, wave(t) }`                              |
| `exporters.register(exporter)`    | An export format: `run({ note, scale, onProgress })` returns `{ blob, fileName }` |
| `importers.register(importer)`    | A file type to open: `{ id, extensions, run(file, { store }) }`                   |
| `commands.register(command)`      | An action: `{ id, name, icon, run(editor) }`                                      |
| `panels.register(panel)`          | A panel: `render(container, editor)` may return a cleanup function                |
| `editor()`                        | The open editor, or `null` on the bookshelf                                       |
| `toast(message)`                  | Show a short message                                                              |
| `readData()` / `writeData(value)` | Data saved inside the open note                                                   |
| `on(event, listener)`             | `'note-open'`, `'note-close'` or `'page-change'`                                  |

Tools with an `order` of 60 or more appear under **More**. The full types are in [`src/plugin/host.ts`](src/plugin/host.ts) and [`src/app/tools.ts`](src/app/tools.ts).

## How it works

- **Small pieces.** Each layer of each page is stored in little squares. Identical squares are kept only once, and blank or single-color ones take up no room at all — so long notes with lots of layers still open quickly.
- **Only what changed.** When you turn a page, only the parts that differ get redrawn.
- **In the background.** Exporting, importing, tidying notes and turning pictures into dots all happen off to the side, so the screen never freezes.
- **One file.** The build produces a single `index.html` (about 835 KB, fonts and all) plus `sw.js` and `manifest.webmanifest`. Every link is relative, so the site works from any folder.

## Development

You need **Node.js 24** or newer. FlipBook uses no libraries at runtime — the tools below are only there to build and check it.

```bash
git clone https://github.com/grigory321/flipbook.git
cd flipbook
npm install
npm run dev
```

Then open <http://localhost:5173/flipbook/>. The dev server rebuilds when you save a file. Set `PORT` to use another port.

| Command                              | What it does                                             |
| ------------------------------------ | -------------------------------------------------------- |
| `npm run dev`                        | Serve the app from memory and rebuild on save            |
| `npm run check`                      | Type check, format check, tests and build check together |
| `npm test`                           | Run the tests                                            |
| `npm run build`                      | Check that the site builds, without writing files        |
| `node scripts/build.mjs --out <dir>` | Write the site to a folder                               |

## Deploy your own copy

**GitHub Pages.** Fork the repository, open **Settings → Pages**, and set **Source** to **GitHub Actions**. Every push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which checks, builds and publishes the site.

**Anywhere else.** Run `node scripts/build.mjs --out dist` and upload the folder to any static host. Serve it over HTTPS so files for the console are signed and the app works offline.

## FAQ

**Where are my notes?**
In your browser's storage on this device. Use **Save to file** to keep a copy.

**How do I move notes to another device?**
Save them as `.ugb` files and open those with **File** on the other device.

**Does it work offline?**
Yes, once you've opened it over HTTPS.

**The console won't open my exported file.**
Open FlipBook over HTTPS so the file is signed, and read the warnings on the export screen. The note may also be too large for the console.

**Why is there no MP4 option?**
Your browser doesn't support WebCodecs. Try a current Chrome or Edge.

**Can I use my own fonts?**
Yes. Add font files in the text tool. Chromium browsers can also use the fonts installed on your device.

**Is anything uploaded?**
No. FlipBook has no server.

## Contributing

Issues and pull requests are welcome.

1. Run `npm run check` before sending a pull request.
2. Keep the app free of runtime dependencies.
3. Add new on-screen text to all five files in `src/i18n`.
4. Test changes on phone, tablet and desktop sizes, with the page strip and sound rows both open and closed.

## Credits

- [Zen Maru Gothic](https://github.com/googlefonts/zen-marugothic) by The Zen Project Authors, under the SIL Open Font License 1.1
- Some feature ideas came from MemoAnima (GPL-3.0). FlipBook contains none of its code.

## License

The code is released into the public domain under the [Unlicense](LICENSE).

The font is under the [SIL Open Font License 1.1](assets/fonts/OFL.txt).

The signing key in `src/compat/keys.ts` is not part of this work. It is included only so the console can read exported notes.

## Disclaimer

FlipBook is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by Nintendo Co., Ltd. or Hatena Co., Ltd. Nintendo DSi, Nintendo 3DS, Flipnote Studio and Flipnote Studio 3D are trademarks of Nintendo. Their names are used only to describe the file formats FlipBook supports.

---

## 日本語

うごくノート（FlipBook Studio）は、ブラウザで動くパラパラまんがアプリです。ノートのページに絵を描いて、めくって、音をつけて再生する。手のひらサイズのゲーム機で遊ぶような感覚で使えます。うごくメモ帳のファイルも読み書きできるので、作品は FlipBook、ニンテンドーDSi、ニンテンドー3DS の間を行き来できます。

インストールもアカウントもいりません。作品はぜんぶ自分の端末の中に残ります。

**[ブラウザで使う](https://grigory321.github.io/flipbook/)**

### もくじ

- [できること](#できること)
- [はじめかた](#はじめかた)
- [ノートの種類](#ノートの種類)
- [描く道具](#描く道具)
- [ページとアニメーション](#ページとアニメーション)
- [音](#音)
- [文字と画像](#文字と画像)
- [DSi・3DS とのやり取り](#dsi3ds-とのやり取り)
- [読みこみと書き出し](#読みこみと書き出し)
- [操作](#操作)
- [画面の形](#画面の形)
- [せってい](#せってい)
- [対応ブラウザ](#対応ブラウザ)
- [プライバシーと保存](#プライバシーと保存)
- [プラグイン](#プラグイン)
- [しくみ](#しくみ)
- [開発](#開発)
- [自分で公開する](#自分で公開する)
- [よくある質問](#よくある質問)
- [協力のしかた](#協力のしかた)
- [クレジット](#クレジット)
- [ライセンス](#ライセンス)
- [おことわり](#おことわり)

### できること

- **描く**: 実機のペン先、もようのふで、19 種の画材（水彩、木炭、エアブラシ、ネオンなど）、図形、ぬりつぶし、ドット絵
- **動かす**: 最大 9999 ページ。前後のページのうす表示、みちすじ、ゆらゆら差分、逆の順番・行って帰る・くり返しなどのまとめ操作
- **音をつける**: タイムラインに BGM 2 本と効果音 4 つ。用意された音、マイクの録音、音のファイルから選べます
- **実機とやり取りする**: うごくメモ帳の `.ppm`（DSi）と、うごくメモ帳3D の `.kwz`（3DS）を開いて保存できます
- **書き出す**: GIF、動く PNG、音つきの MP4、連番 PNG、WAV
- **オフラインで動く**: 一度開けばネットなしで使えて、描くそばから自動で保存します
- **指・ペン・マウス・キーボード・ゲームパッド** で操作でき、スマホ・タブレット・PC それぞれに合った画面の形があります
- **5 言語**: 日本語、英語、スペイン語、フランス語、ロシア語
- **プラグイン** で道具、もよう、音、書き出し、読みこみ、コマンド、パネルを足せます

### はじめかた

1. **[grigory321.github.io/flipbook](https://grigory321.github.io/flipbook/)** を開きます。
2. タイトル画面をタップします。ノートだなが開き、見本の「はずむボール」が入っています。
3. 「あたらしいノート」でノートの種類を選び、紙の大きさともようを選びます。
4. 1 ページ目に描いたら「ふやす」か次のページの矢印を押します。最後のページの先へ進むとページが 1 枚ふえます。
5. 再生してみましょう。はやさはページ番号の横のメーターで変えられます。
6. 「書き出す」で GIF、動画、DSi・3DS 用のファイルを保存できます。

作品は自動で保存されます。控えを取ったりほかの端末へ移したりするときは、ノートだなの「ファイルに保存」で `.ugb` ファイルにしてください。

### ノートの種類

|              | ふつうのノート                               | うごメモ（DSi）                      | うごメモ3D（3DS）               |
| ------------ | -------------------------------------------- | ------------------------------------ | ------------------------------- |
| 紙の大きさ   | 512×384、640×360、360×640、480×480、1280×720 | 256×192                              | うごくメモ帳3D と同じ           |
| ページ       | 最大 9999                                    | 最大 999                             | 最大 999                        |
| レイヤー     | 1〜8 枚（はじめは 2 枚）                     | 2 枚                                 | 3 枚                            |
| 色           | 変えられるペンの色 12 色、紙の色 6 色        | 白か黒の紙に、黒または白・赤・青     | 白・黒・赤・黄・緑・青          |
| 紙のもよう   | むじ、よこせん、ほうがん、ドット             | むじ                                 | むじ                            |
| はやさ       | 0.5〜30 コマ/秒の 8 段階                     | 0.5〜30 コマ/秒の 8 段階             | 0.2〜30 コマ/秒の 11 段階       |
| 音の長さ     | 実機の制限なし                               | BGM 約 60 秒、効果音 約 2 秒（8 kHz） | BGM 60 秒、効果音 2 秒（16 kHz） |
| やり取りの形 | FlipBook どうし（`.ugb`）                    | うごくメモ帳（`.ppm`）               | うごくメモ帳3D（`.kwz`）        |

うごメモとうごメモ3D のノートは実機の決まりに合わせてあるので、描いたとおりに実機でも見えます。どのノートも `.ppm` と `.kwz` に書き出せますが、ふつうのノートは実機の色と大きさに変換されます。

### 描く道具

| 道具     | キー | できること                                                                     |
| -------- | :--: | ------------------------------------------------------------------------------ |
| ペン     |  P   | 線を描きます。ペン先、ふとさ、こさ、線のかざり、かきごこちを選べます           |
| もよう   |  B   | もようでぬります。小・中・大のふでか、バケツ                                 |
| けしゴム |  E   | 点・四角・まる・たて線・よこ線の形で消します。もようの点だけ消すこともできます |
| ぬる     |  F   | 線でかこまれたところを、いまの色でぬります                                     |
| 図形     |  L   | 直線、四角、まるなど 21 種。中をぬるかどうかも選べ、なぞって自分の図形も作れます |
| えらぶ   |  S   | 四角・かこむ・つながりで選んで、動かす、回す、反転、大きさ、四隅で変形        |
| 文字     |  T   | 手持ちのフォントや縦書き、縁取りで文字を置けます                               |
| 画像     |      | 画像を紙の上の点に変えます                                                     |
| ドット   |  G   | マス目に色をつけます。同じ色のマスからなぞると消えます                        |
| うごかす |  M   | いまのレイヤーの絵をぜんぶ動かします。つまみで大きさと向きも変えられます       |
| ゆがめる |      | 絵をおす・ふくらます・へこませます                                             |
| みちすじ |      | なぞった道に沿って絵が動くページを作ります                                     |
| スポイト |  I   | 紙の上の色を取ります（ふつうのノート）                                         |

はじめの 6 つは道具の列に並んでいて、ほかは「その他」の中にあります。

**ふでばこ** は 3 つあります。

- **ふつう**: うごメモのノートでは実機のペン先。ふつうのノートでは、まるペン、インクペン、ふで、サインペン、かくペン
- **じょうきゅう**（うごメモのノート）: 太いペン、ふで、ふち、スプレー大やクレヨン大など、実機の上級のペン
- **がざい**: えんぴつ、色えんぴつ、クレヨン、チョーク、木炭、パステル、水彩、エアブラシ、マーカー、蛍光ペン、つけペン、リボン、ネオン、スプレー、点描、しぶき、てんてん、キラキラ、ハート

ペンのパネルの「かきごこち」では、「筆圧で太さを変える」と「線をなめらかにする」を切りかえられます。手ぶれ補正の強さはせっていで決めます。うごメモのノートでは、ノートのせっていの「上級ふでばこ」を切ると、実機と同じく色を選ぶだけでレイヤーが切りかわります。

**えらぶ** で選んだ絵は、コピーしたり、はんこのように何度も押したり、消したり、自分の図形やもように登録したり、置いた文字を直したりできます。

**もよう** には実機のもようが入っています。最初から入っている「もようパック」プラグインで、すな、なみ、レンガ、ほし、ハート、うろこ、あめ、はなの 8 種がふえます（せっていで切れます）。8×8 の自分のもようも作れます。

### ページとアニメーション

- **コマ一覧**: ページをフィルムのコマとして並べます。長押しして動かすと並べかえできます。
- **ページのメニュー**: コピーして次へ、コピーとはりつけ、レイヤーをけす、ページをけす、まとめてふやす、ページへとぶ。
- **前後をうすく表示**: 前と次のページをうすく重ねます。何枚分かはせっていで選べます。
- **まとめて操作**: ページの範囲を選んで、逆の順番、行って帰る、くり返す、のばす、消す。
- **ゆらゆら差分**: 少しゆらしたページを足して、線がふるえる動きにします。線だけか全体か、強さ、足す枚数を選べます。
- **みちすじ**: 道をなぞって、ページ数、うごきかた（一定・だんだん速く・だんだん遅く・なめらか）、最後の大きさ、進む向きに回すかを選びます。ページをふやすか、次のページへ重ねるかも選べます。
- **レイヤー**: みせる・かくす、ロック、並べかえ。ふつうのノートではふやす・へらすもできます。紙の色は 1 ページだけでも、ぜんぶのページでも変えられます。
- **再生**: 再生、くりかえす、ノートのはやさを選べます。

### 音

コマ一覧の下の **音の段** を開きます。どのノートにも BGM 2 本と効果音 4 つの段があります。

- 段をタップして音を選びます。用意された音 8 種（ポン、ボヨン、キラキラ、コイン、ジャンプ、ドスン、ヒュン、チーン）、マイクで録音した音、音のファイルから選べます。
- 音を段の上でスライドすると鳴るページが変わり、右端のつまみで長さを変えられます。
- 段ごとに音量と消音があります。
- 音は置いたときのはやさを基準にします。あとで再生のはやさを変えると、音もいっしょに速くなったり遅くなったりします。

### 文字と画像

**文字** は、まる・ゴシック・明朝・手書きの基本フォント、自分で足したフォントファイル、Chromium 系のブラウザなら端末のフォントも使えます。太字、縦書き、縁取り、袋文字にできて、色も変えられます。「下の絵を消す」で文字の形に下の絵を抜けます。置いたあとからでも文字を直せます。

**画像** は網点、線画、カラーのどれかで紙の上の点に変わります。置く前に濃さ、大きさ、なめらかさを決められます。

### DSi・3DS とのやり取り

**実機から FlipBook へ。** SD カードから `.ppm`（DSi）か `.kwz`（3DS）のファイルを取り出して、ノートだなの「ファイル」で開きます。ページ、レイヤー、色、はやさ、音がそのまま入ってきます。

**FlipBook から実機へ。** 「書き出す」で「DSi へ（.ppm）」か「3DS へ（.kwz）」を選び、できたファイルを SD カードの、うごくメモ帳が作品を置くフォルダへコピーします。

- 実機用のファイルには署名がつきます。署名には安全なページが必要なので、HTTPS（GitHub Pages など）か `localhost` で開いてください。そうでないときは、実機で読めないことをお知らせします。
- 書き出す前に、変わるところを画面に出します。
  - 絵はそのままか、色と大きさを変換するか
  - 入らない音をはずしたか
  - 実機で開ける大きさをこえていないか
  - 実機で続きを描けるだけの空きがあるか

### 読みこみと書き出し

| 形式                         | 読みこみ | 書き出し | 説明                                    |
| ---------------------------- | :------: | :------: | --------------------------------------- |
| `.ugb`（このアプリのノート） |    ✓     |    ✓     | ぜんぶ入るので、あとで続きを描けます    |
| `.ppm`（うごくメモ帳、DSi）  |    ✓     |    ✓     | 実機用の署名つき                        |
| `.kwz`（うごくメモ帳3D、3DS）|    ✓     |    ✓     | 実機用の署名つき                        |
| GIF                          |          |    ✓     | 1・2・4・8 倍の大きさ                   |
| 動く PNG                     |          |    ✓     | 色がきれいなまま。1・2・4・8 倍の大きさ |
| れんばん画像（.zip）         |          |    ✓     | ページごとの PNG。1・2・4・8 倍の大きさ |
| 動画（.mp4）                 |          |    ✓     | 音つき。WebCodecs のあるブラウザで出ます |
| 音声（.wav）                 |          |    ✓     | 音だけ                                  |
| いまのページの PNG           |          |    ✓     | 書き出す画面から                        |

書き出しは裏で動くので、書き出している間も画面は固まりません。

### 操作

#### 指とペン

| 操作                               | 内容             |
| ---------------------------------- | ---------------- |
| 指やペンでなぞる                   | 描く             |
| 2 本指でタップ                     | もどす           |
| 3 本指でタップ                     | やりなおす       |
| 2 本指でひらく・とじる             | 拡大・縮小       |
| 2 本指で動かす                     | 紙を動かす       |
| コマ一覧のページを長押しして動かす | 並べかえ         |
| 音の段の音をスライド               | 鳴る場所を変える |

#### キーボード

| キー                         | 内容                                     |
| ---------------------------- | ---------------------------------------- |
| ← → か Q W か Page Up/Down   | ページをめくる                           |
| Enter                        | 再生・ストップ                           |
| N                            | ページをふやす                           |
| D                            | ページをコピー                           |
| Delete                       | ページをけす                             |
| O                            | 前後をうすく表示                         |
| P B E F L S M T G I          | 道具を選ぶ                               |
| Ctrl + Z                     | もどす                                   |
| Ctrl + Y か Ctrl + Shift + Z | やりなおす                               |
| Ctrl + C / X / V             | コピー、切り取り、はりつけ               |
| Ctrl + A                     | レイヤーの絵をぜんぶ選ぶ                 |
| ↑ ↓ ← →                      | えらんだ絵を 1 点動かす（Shift で 10 点）|
| Enter / Esc                  | えらんだ絵をきめる / やめる              |
| Space + ドラッグ             | 紙を動かす                               |
| 0                            | 画面に合わせる                           |
| H                            | パネルをしまう・出す                     |
| Z / X                        | メニューでけってい / もどる              |

Mac では Ctrl のかわりに Cmd を押します。

#### ゲームパッド

ふつうのゲームパッドはキーボードと同じように動きます。

| ボタン     | 同じキー       | 内容                             |
| ---------- | -------------- | -------------------------------- |
| 十字キー   | 矢印キー       | ボタンの間を動く、ページをめくる |
| 下のボタン | Enter          | けってい、描く画面では再生       |
| 右のボタン | Esc            | もどる                           |
| L・R       | Page Up / Down | ページをめくる                   |
| スタート   |                | 再生・ストップ                   |

画面の案内は、キー、ボタン、指の操作のうち、いま使っている入力に合わせて変わります。

### 画面の形

画面の大きさに合わせて、使いやすい形に変わります。

- **PC**: 左に道具、右にペンとレイヤーのパネル。パネルは上の帯のボタンか H キーでしまえます。はじめはしまってあります。
- **タブレット**: 道具とパネルを画面の端のタブにして、紙を横いっぱいに使います。
- **スマホの縦持ち**: 道具を下に 1 行で並べます。
- **スマホの横持ち**: 帯を下の 1 本にまとめて、紙を縦いっぱいに出します。

画面の高さが足りないときは道具のボタンを縮め、それでも足りなければアイコンだけにします。それでも入らない道具は「その他」へ移ります。せっていで **左手** にすると左右が入れかわります。

### せってい

- **ことば**: 端末に合わせるか、5 言語から選ぶ
- **音と動き**: 画面の効果音、めくるときの音、描く音・消す音、音の大きさ、タイトル画面をとばす
- **描きごこち**: 手ぶれ補正の強さ
- **利き手**: 右手か左手。左手にすると描く画面の左右が入れかわる
- **うすく表示**: 前と次のページを何枚分うすく出すか
- **プラグイン**: プラグインの入・切と読みこみ

### 対応ブラウザ

開発と確認は Chromium 系のブラウザ（Chrome、Edge）で行っています。ほかの新しいブラウザでも動くはずで、ブラウザにない機能は選択肢を出さないか、別のやり方で動きます。

| 機能                  | 必要なもの                        | ないとき                   |
| --------------------- | --------------------------------- | -------------------------- |
| ノートの保存          | IndexedDB                         | ノートを残せない           |
| 裏での処理            | Web Worker                        | ページの中で動く           |
| `.ugb` と動く PNG     | Compression Streams               | 使えない                   |
| MP4 の書き出し        | WebCodecs                         | MP4 の選択肢が出ない       |
| 端末のフォント        | Local Font Access（Chromium、PC） | 基本と足したフォントだけ   |
| 録音                  | マイクの許可                      | 用意された音とファイルだけ |
| DSi・3DS 用のファイル | HTTPS か `localhost`（Web Crypto）| 署名がつかず、お知らせが出る |
| オフライン            | HTTPS での Service Worker         | 開くのにネットが要る       |

### プライバシーと保存

サーバー、アカウント、アクセス解析、広告はありません。アプリ自体を読みこむほかは、どこにも何も送りません。

- ノートはブラウザの中（IndexedDB の `flipbook`）に保存します。足したフォントは `flipbook-fonts`、せっていとプラグインは `localStorage` に置きます。
- サイトのデータを消すとノートも消えます。控えは「ファイルに保存」で取ってください。
- ブラウザや端末の間で自動ではそろいません。`.ugb` ファイルで移してください。

### プラグイン

プラグインは JavaScript のモジュール 1 つです。せってい → プラグイン → 「プラグインを読みこむ」で選びます。一度読みこめば毎回読みこまれ、同じ場所で切ることもできます。

> [!WARNING]
> プラグインはアプリと同じ権限で動きます。信用できるものだけを読みこんでください。

書き方は英語の [Plugins](#plugins) の例と表を見てください。`setup` が関数を返すと、プラグインを切ったときにそれが呼ばれます。道具・もよう・コマンド・パネルを足す見本は [`plugins/stamp-pack.js`](plugins/stamp-pack.js) にあります。`order` が 60 以上の道具は「その他」に入ります。

### しくみ

- **小さなピース**: ページのレイヤーを小さな四角に分けて持ちます。同じ四角は 1 回だけ、白紙や 1 色だけの四角は場所を取りません。だからページやレイヤーが多い作品でも、するっと開けます。
- **変わったところだけ**: ページをめくるときは、違うところだけを描き直します。
- **裏でこつこつ**: 書き出し、読みこみ、ノートの整理、画像の点への変換は裏で行うので、画面が止まりません。
- **ファイルは 1 つ**: ビルドすると、フォントも中に入った `index.html`（約 835 KB）と、`sw.js`、`manifest.webmanifest` ができます。リンクはすべて相対なので、どのフォルダに置いても動きます。

### 開発

**Node.js 24** 以上が必要です。実行時に使うライブラリはありません。下のコマンドは、ビルドと確認のためのものです。

```bash
git clone https://github.com/grigory321/flipbook.git
cd flipbook
npm install
npm run dev
```

<http://localhost:5173/flipbook/> を開きます。ファイルを保存すると作り直します。ポートは `PORT` で変えられます。

| コマンド                             | 内容                                            |
| ------------------------------------ | ----------------------------------------------- |
| `npm run dev`                        | メモリから配信し、保存のたびに作り直す          |
| `npm run check`                      | 型、整形、テスト、ビルドの確認をまとめて行う    |
| `npm test`                           | テストを実行する                                |
| `npm run build`                      | ファイルを書かずにビルドできるかだけ確かめる    |
| `node scripts/build.mjs --out <dir>` | サイトをフォルダに書き出す                      |

### 自分で公開する

**GitHub Pages**: リポジトリをフォークし、Settings → Pages で Source を GitHub Actions にします。`main` へ push するたびに [`.github/workflows/pages.yml`](.github/workflows/pages.yml) が確認、ビルド、公開を行います。

**ほかの場所**: `node scripts/build.mjs --out dist` でできたフォルダを、静的なサイトを置ける所にアップロードします。実機用のファイルに署名をつけ、オフラインでも動かすために HTTPS で配信してください。

### よくある質問

**ノートはどこにある？**
この端末のブラウザの中です。控えは「ファイルに保存」で取ってください。

**ほかの端末へ移すには？**
`.ugb` ファイルに保存して、移った先のノートだなの「ファイル」で開きます。

**オフラインで使える？**
使えます。HTTPS で一度開いたあとなら動きます。

**書き出したファイルを実機が開かない。**
HTTPS で開いて署名をつけ、書き出す画面のお知らせを確かめてください。実機で開ける大きさをこえていることもあります。

**MP4 が選べない。**
ブラウザが WebCodecs に対応していません。新しい Chrome か Edge で試してみてください。

**自分のフォントを使える？**
使えます。文字の道具でフォントファイルを足してください。Chromium 系のブラウザなら、端末に入っているフォントも使えます。

**どこかにアップロードされる？**
されません。サーバーがないからです。

### 協力のしかた

Issue と Pull Request を歓迎します。

1. Pull Request の前に `npm run check` を通してください。
2. 実行時のライブラリは足さないでください。
3. 画面に出す文は `src/i18n` の 5 つのファイルすべてに足してください。
4. 画面を変えたら、スマホ・タブレット・PC の大きさで、コマ一覧と音の段を開いた状態と閉じた状態の両方を確かめてください。

### クレジット

- [Zen Maru Gothic](https://github.com/googlefonts/zen-marugothic)（The Zen Project Authors、SIL Open Font License 1.1）
- MemoAnima（GPL-3.0）を機能の考え方の参考にしました。コードは含みません。

### ライセンス

コードは [Unlicense](LICENSE) でパブリックドメインにしています。

フォントは [SIL Open Font License 1.1](assets/fonts/OFL.txt)。

`src/compat/keys.ts` の署名鍵はこのコードの著作物ではありません。実機で作品を読めるようにするためだけに含めています。

### おことわり

個人が作った非公式のファンツールです。任天堂株式会社、株式会社はてなとは関係がなく、許諾や推奨を受けたものでもありません。「ニンテンドーDSi」「ニンテンドー3DS」「うごくメモ帳」「うごくメモ帳3D」は任天堂株式会社の商標または登録商標です。対応している形式を説明するためにのみ名前を挙げています。
