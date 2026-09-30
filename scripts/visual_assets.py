"""Create inspectable PNG previews while retaining the original asset and hash."""
from pathlib import Path
from importlib.metadata import version
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile


def digest(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def normalize_visual(source, target):
    source, target = Path(source), Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    limitations = []
    if source.suffix.lower() == '.svg':
        from defusedxml import ElementTree as SafeXML
        from xml.etree import ElementTree as XML
        tree = SafeXML.fromstring(source.read_bytes(), forbid_dtd=True, forbid_entities=True, forbid_external=True)
        for element in tree.iter():
            values = list(element.attrib.values())
            if element.tag.split('}')[-1] == 'style':
                values.append(element.text or '')
            for key, value in element.attrib.items():
                if key.split('}')[-1] == 'href' and not (value.startswith('#') or re.match(r'^data:image/(png|jpeg|gif|webp);base64,', value, re.I)):
                    raise ValueError('SVG references an external resource; supply a self-contained asset before visual inspection.')
            for value in values:
                if '@import' in value.lower() or any(not part.strip(' \t\r\n\"\'').startswith('#') for part in re.findall(r'url\((.*?)\)', value, re.I)):
                    raise ValueError('SVG styles reference an external resource; preserve it as an unresolved visual gap.')
        with tempfile.TemporaryDirectory(prefix='know-fu-svg-') as temp:
            sanitized = Path(temp) / 'self-contained.svg'
            sanitized.write_bytes(XML.tostring(tree, encoding='utf-8'))
            subprocess.run([os.environ.get('KB_NODE', 'node'), str(Path(__file__).with_name('render-svg.mjs')),
                            str(sanitized), str(target)], check=True, capture_output=True, timeout=60)
        renderer = 'resvg-js-2.6.2'
    else:
        from PIL import Image
        with Image.open(source) as image:
            if getattr(image, 'n_frames', 1) > 1:
                limitations.append('Preview shows the first frame of an animated asset; inspect remaining frames separately.')
            if image.width * image.height > 60_000_000:
                raise ValueError('Image dimensions exceed the visual preview limit')
            image.convert('RGBA').save(target, format='PNG')
        renderer = 'Pillow-' + version('pillow')
    return dict(source_asset=source.name, source_sha256=digest(source), preview_asset=target.name,
                preview_sha256=digest(target), renderer=renderer, limitations=limitations)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(normalize_visual(*sys.argv[1:3]), ensure_ascii=False))
