"""Lossless original retention is handled by the coordinator; this produces versioned locators."""
import sys,json,hashlib,re,os,zipfile
from pathlib import Path
source=Path(sys.argv[1]); output=Path(sys.argv[2]); units=[]; limitations=[]
digest=lambda b:hashlib.sha256(b).hexdigest()
def add(kind,text,locator,asset=None):
    units.append(dict(unit_id=f"unit-{len(units)+1}",kind=kind,text=text,sha256=digest(text.encode()),locator=locator,asset_path=asset))
def loc(kind,label,start=None,end=None,anchor=None):
    return dict(kind=kind,label=label,start=start,end=end,anchor=anchor,precision='exact')
ext=source.suffix.lower()
if ext in ('.html','.htm'):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(source.read_bytes(),'html.parser')
    for el in soup(['script','style','noscript']):el.decompose()
    text=soup.get_text('\n',strip=True)
    add('text',text,loc('web','Preserved HTML body',anchor='body'))
    for n,image in enumerate(soup.find_all('img')):
        add('figure',image.get('alt','') or '[Image requires visual inspection]',loc('web',f'Image {n+1}',anchor=image.get('src',f'img:{n+1}')))
    if soup.find('img'):limitations.append('Remote HTML images are not downloaded automatically; inspect the preserved source with its supplied assets.')
    parser='beautifulsoup-direct'
elif ext=='.epub':
    from ebooklib import epub,ITEM_DOCUMENT,ITEM_IMAGE
    from bs4 import BeautifulSoup
    book=epub.read_epub(str(source))
    documents=list(book.get_items_of_type(ITEM_DOCUMENT))
    order={entry[0]:n for n,entry in enumerate(book.spine)}
    documents.sort(key=lambda item:order.get(item.get_id(),len(order)))
    for item in documents:
        soup=BeautifulSoup(item.get_content(),'html.parser')
        for el in soup(['script','style','noscript']):el.decompose()
        text=soup.get_text('\n',strip=True)
        add('text',text,loc('epub',item.get_name(),anchor=item.get_name()))
    for n,item in enumerate(book.get_items_of_type(ITEM_IMAGE)):
        file=output/f'image-{n+1}{Path(item.get_name()).suffix}'
        file.write_bytes(item.get_content())
        add('figure','',loc('epub',item.get_name(),anchor=item.get_name()),file.name)
    parser='ebooklib-direct'
elif ext=='.pdf':
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.accelerator_options import AcceleratorOptions,AcceleratorDevice
    options=PdfPipelineOptions()
    options.accelerator_options=AcceleratorOptions(num_threads=4,device=AcceleratorDevice.CPU)
    options.generate_page_images=True;options.generate_picture_images=True;options.images_scale=1.5
    converter=DocumentConverter(format_options={InputFormat.PDF:PdfFormatOption(pipeline_options=options)})
    result=converter.convert(source);doc=result.document
    (output/'docling.json').write_text(json.dumps(doc.export_to_dict(),ensure_ascii=False),encoding='utf8')
    for number,page in sorted(doc.pages.items()):
        image=page.image.pil_image if page.image else None
        asset=None
        if image:
            file=output/f'page-{number:04d}.png';image.save(file);asset=file.name
        text=doc.export_to_markdown(page_no=number)
        add('text',text,loc('pages',f'Physical PDF page {number}',number,number,anchor='text'))
        add('figure','Page layout, tables, formulas and instructional visuals require inspection.',loc('pages',f'Physical PDF page {number}: visual',number,number,anchor='visual'),asset)
    parser='docling-cpu'
else:
    raise SystemExit('Unsupported document type; media requires an authorized API transcription job. No local Whisper fallback.')
for u in units:
    if u.get('asset_path'):
        u['asset_path']=(output/str(u['asset_path'])).as_posix()
        u['asset_sha256']=digest(Path(u['asset_path']).read_bytes())
print(json.dumps(dict(version=1,source_sha256=digest(source.read_bytes()),parser=parser,units=units,limitations=limitations),ensure_ascii=False))
