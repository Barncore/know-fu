"""Derived navigation and unscaled crops. Neither operation certifies visual review."""
import sys, json, hashlib
from pathlib import Path
from PIL import Image, ImageDraw

if sys.argv[1] == '--page':
    import pypdfium2 as pdfium
    source, target = map(Path, sys.argv[2:4]); number=int(sys.argv[4]); scale=float(sys.argv[5])
    with pdfium.PdfDocument(source) as document:
        if number < 1 or number > len(document) or not 1 <= scale <= 6: raise ValueError('Invalid page/render scale')
        page=document[number-1]; w,h=page.get_size()
        if w*h*scale*scale > 60_000_000: raise ValueError('Requested render is too large; use a lower scale')
        image=page.render(scale=scale).to_pil(); image.save(target)
        print(json.dumps(dict(physical_page=number,scale=scale,width=image.width,height=image.height)))
elif sys.argv[1] == '--crop':
    source, target = map(Path, sys.argv[2:4])
    x, y, w, h = map(int, sys.argv[4:8])
    with Image.open(source) as im:
        if min(x, y) < 0 or min(w, h) <= 0 or x+w > im.width or y+h > im.height:
            raise ValueError('Crop exceeds source bounds')
        im.crop((x, y, x+w, y+h)).save(target)
    print(json.dumps(dict(width=w, height=h, scaled=False)))
else:
    frames = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
    output = Path(sys.argv[2]); sheets = []
    for offset in range(0, len(frames), 12):
        group = frames[offset:offset+12]
        image = Image.new('RGB', (1280, 3*270), '#14171d'); draw = ImageDraw.Draw(image)
        for i, frame in enumerate(group):
            x, y = (i % 4)*320, (i//4)*270
            with Image.open(frame['path']) as im:
                im.thumbnail((318, 240)); image.paste(im, (x, y+26))
            t = frame['seconds']; draw.text((x+6, y+5), f'{int(t//60):02d}:{t%60:05.2f}  frame {offset+i+1}', fill='white')
        file = output/f'sheet-{offset//12+1:04d}.jpg'; image.save(file, quality=90)
        sheets.append(dict(path=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest(), frames=group))
    print(json.dumps(sheets))
