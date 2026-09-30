"""Versioned extraction with preserved originals, complementary text and located visuals."""
import hashlib
import json
import sys
from pathlib import Path
from pdf_extract import extract_pdf, file_hash
from visual_assets import normalize_visual

sys.stdout.reconfigure(encoding='utf-8')
source, output = map(Path, sys.argv[1:3])
options = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
output.mkdir(parents=True, exist_ok=True)
units, limitations = [], []
metadata = {}


def add(kind, text, locator, asset=None, details=None):
    unit = dict(unit_id=f'unit-{len(units)+1}', kind=kind, text=text,
                sha256=hashlib.sha256(text.encode('utf-8')).hexdigest(), locator=locator, asset_path=asset)
    if details is not None:
        unit['details'] = details
    units.append(unit)


def loc(kind, label, start=None, end=None, anchor=None):
    return dict(kind=kind, label=label, start=start, end=end, anchor=anchor, precision='exact')


ext = source.suffix.lower()
if ext in ('.html', '.htm'):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(source.read_bytes(), 'html.parser')
    for element in soup(['script', 'style', 'noscript']):
        element.decompose()
    add('text', soup.get_text('\n', strip=True), loc('web', 'Preserved HTML body', anchor='body'))
    for number, image in enumerate(soup.find_all('img'), 1):
        add('figure', image.get('alt', '') or '[Image requires visual inspection]',
            loc('web', f'Image {number}', anchor=image.get('src', f'img:{number}')))
    if soup.find('img'):
        limitations.append('Remote HTML images are not downloaded automatically; inspect the preserved source with its supplied assets.')
    parser = 'beautifulsoup-direct'
elif ext == '.epub':
    from ebooklib import epub, ITEM_DOCUMENT, ITEM_IMAGE
    from bs4 import BeautifulSoup
    book = epub.read_epub(str(source))
    order = {entry[0]: n for n, entry in enumerate(book.spine)}
    documents = sorted(book.get_items_of_type(ITEM_DOCUMENT), key=lambda item: order.get(item.get_id(), len(order)))
    for item in documents:
        soup = BeautifulSoup(item.get_content(), 'html.parser')
        for element in soup(['script', 'style', 'noscript']):
            element.decompose()
        add('text', soup.get_text('\n', strip=True), loc('epub', item.get_name(), anchor=item.get_name()))
    images = [item for item in book.get_items() if item.get_type() == ITEM_IMAGE or item.media_type.startswith('image/')]
    for number, item in enumerate(images, 1):
        suffix = Path(item.get_name()).suffix.lower()
        original = output / f'image-{number}.original{suffix}'
        original.write_bytes(item.get_content())
        asset = original
        details = dict(source_asset=original.name, source_sha256=file_hash(original))
        if suffix not in ('.png', '.jpg', '.jpeg', '.webp'):
            asset = output / f'image-{number}.png'
            details = normalize_visual(original, asset)
            limitations.extend(details['limitations'])
        add('figure', '', loc('epub', item.get_name(), anchor=item.get_name()), asset.name, details=details)
    parser = 'ebooklib-visual-2'
elif ext == '.pdf':
    metadata = extract_pdf(source, output, options, add, loc, limitations)
    parser = metadata.pop('parser')
else:
    raise SystemExit('Unsupported document type; media requires an authorized API transcription job. No local Whisper fallback.')

for unit in units:
    if unit.get('asset_path'):
        asset = output / unit['asset_path']
        unit['asset_path'] = asset.resolve().as_posix()
        unit['asset_sha256'] = file_hash(asset)
print(json.dumps(dict(version=2, source_sha256=file_hash(source), parser=parser, units=units,
                      limitations=list(dict.fromkeys(limitations)), **metadata), ensure_ascii=False))
