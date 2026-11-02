import io
import pathlib
import re

from fontTools.merge import Merger, Options as MergeOptions
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

SOURCE = pathlib.Path('node_modules/@fontsource/zen-maru-gothic/files')
OUTPUT = pathlib.Path('assets/fonts')

WEIGHTS = {'500': 'all', '700': 'all', '900': 'title'}
SCRIPTS = ['japanese', 'latin', 'latin-ext', 'cyrillic']

KANA = ''.join(chr(code) for code in range(0x3041, 0x3097))
KATAKANA = ''.join(chr(code) for code in range(0x30a1, 0x30fb))
LATIN = ''.join(chr(code) for code in range(0x20, 0x7f))
LATIN_EXTRA = 'áéíóúüñ¿¡ÁÉÍÓÚÑàâçèêëîïôùûœÀÂÇÈÊËÎÏÔÙÛŒ«»·×✓←→…'
CYRILLIC = ''.join(chr(code) for code in range(0x410, 0x450)) + 'ёЁ'

TITLE_TEXT = KANA + KATAKANA + LATIN + LATIN_EXTRA + CYRILLIC


def source_text() -> str:
    text = ''

    for path in list(pathlib.Path('src').rglob('*.ts')) + [pathlib.Path('src/index.html')]:
        text += path.read_text(encoding='utf-8')

    return re.sub(r'\s', '', text)


def subset_slice(path: pathlib.Path, text: str) -> TTFont | None:
    font = TTFont(path)
    available = set(font.getBestCmap())
    wanted = {ord(char) for char in text} & available

    if not wanted:
        return None

    options = Options()
    options.layout_features = ['kern', 'palt', 'liga', 'ccmp', 'locl']
    options.notdef_outline = True
    options.hinting = False
    options.name_IDs = [1, 2]

    subsetter = Subsetter(options)

    subsetter.populate(unicodes=wanted)
    subsetter.subset(font)

    return font


def merge(fonts: list[TTFont]) -> TTFont:
    streams = []

    for font in fonts:
        stream = io.BytesIO()

        font.flavor = None
        font.save(stream)
        stream.seek(0)
        streams.append(stream)

    return Merger(MergeOptions()).merge(streams)


def build_weight(weight: str, text: str) -> None:
    pieces = []

    for script in SCRIPTS:
        path = SOURCE / f'zen-maru-gothic-{script}-{weight}-normal.woff2'
        piece = subset_slice(path, text)

        if piece:
            pieces.append(piece)

    font = merge(pieces)

    font.flavor = 'woff2'

    OUTPUT.mkdir(parents=True, exist_ok=True)

    target = OUTPUT / f'zen-maru-{weight}.woff2'

    font.save(target)
    print(target, target.stat().st_size, 'bytes,', len(pieces), 'pieces')


def main() -> None:
    all_text = source_text() + KANA + KATAKANA + LATIN + LATIN_EXTRA + CYRILLIC

    for weight, kind in WEIGHTS.items():
        build_weight(weight, all_text if kind == 'all' else TITLE_TEXT)


if __name__ == '__main__':
    main()
