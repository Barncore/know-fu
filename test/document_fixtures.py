"""Small, independently located synthetic originals for converter regression tests."""
import io
import sys
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from ebooklib import epub
from PIL import Image

folder = Path(sys.argv[1])
folder.mkdir(parents=True, exist_ok=True)
writer = PdfWriter()
for marker in ['PAGE_ONE_TOKEN', 'PAGE_TWO_TOKEN']:
    page = writer.add_blank_page(width=360, height=240)
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({
        NameObject('/F1'): DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                                           NameObject('/Subtype'): NameObject('/Type1'),
                                           NameObject('/BaseFont'): NameObject('/Helvetica')})})})
    stream = DecodedStreamObject()
    stream.set_data(f'BT /F1 18 Tf 30 180 Td ({marker}) Tj 0 -35 Td (Rate = 2.50; count = 17) Tj ET'.encode())
    page[NameObject('/Contents')] = writer._add_object(stream)
with (folder / 'pages.pdf').open('wb') as output:
    writer.write(output)

book = epub.EpubBook()
book.set_identifier('know-fu-visual-test'); book.set_title('Synthetic visual formats'); book.set_language('en')
chapter = epub.EpubHtml(title='Visuals', file_name='chapter.xhtml', lang='en')
chapter.content = '<h1>Three original visuals</h1><img src="shape.svg"/><img src="shape.gif"/><img src="shape.bmp"/>'
book.add_item(chapter); book.spine = ['nav', chapter]; book.add_item(epub.EpubNav())
book.add_item(epub.EpubItem(uid='svg', file_name='shape.svg', media_type='image/svg+xml',
    content=b'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#132a43"/><circle cx="80" cy="50" r="30" fill="#ffb85c"/></svg>'))
for extension, kind in [('gif', 'GIF'), ('bmp', 'BMP')]:
    output = io.BytesIO()
    Image.new('RGB', (160, 100), '#44aacc').save(output, format=kind)
    book.add_item(epub.EpubItem(uid=extension, file_name='shape.' + extension,
                              media_type='image/' + extension, content=output.getvalue()))
epub.write_epub(str(folder / 'visuals.epub'), book)
