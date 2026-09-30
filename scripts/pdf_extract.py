"""Complementary PDF extraction. Page provenance does not certify text fidelity."""
from collections import defaultdict
from importlib.metadata import version
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess


def file_hash(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def project_docling_pages(doc):
    """Split text only when disjoint char spans establish page ownership.

    Tables and ambiguous text spanning pages get a range unit. Docling's normal
    page filter can put an entire multi-page item on its first page.
    """
    pages = defaultdict(list)
    ranges = []
    for item, _ in doc.iterate_items():
        text = getattr(item, 'text', None)
        if text is None and hasattr(item, 'export_to_markdown'):
            text = item.export_to_markdown(doc=doc)
        if not text or not str(text).strip():
            continue
        provenance = list(getattr(item, 'prov', []))
        numbers = sorted(set(p.page_no for p in provenance))
        item_ref = str(getattr(item, 'self_ref', 'unlocated'))
        if len(numbers) == 1:
            pages[numbers[0]].append(dict(text=text, item_ref=item_ref))
            continue
        spans = sorted(set((p.charspan[0], p.charspan[1], p.page_no) for p in provenance))
        valid = hasattr(item, 'text') and bool(spans)
        previous_end = 0
        if valid:
            for start, end, _page in spans:
                if not (previous_end <= start < end <= len(text)) or text[previous_end:start].strip():
                    valid = False
                    break
                previous_end = end
            if text[previous_end:].strip():
                valid = False
        if valid:
            for start, end, number in spans:
                pages[number].append(dict(text=text[start:end], item_ref=item_ref, charspan=[start, end]))
        else:
            ranges.append(dict(text=text, pages=numbers, item_ref=item_ref,
                               limitation='Item cannot be assigned to exact individual pages; inspect its original page range.'))
    return dict(pages), ranges


def poppler_pages(source, output, page_count, layout=False, executable=None):
    executable = executable or os.environ.get('KB_PDFTOTEXT') or shutil.which('pdftotext')
    if not executable:
        raise RuntimeError('Poppler pdftotext is required by the PDF policy; install it or set KB_PDFTOTEXT.')
    file = output / ('poppler-layout.txt' if layout else 'poppler-flow.txt')
    args = [executable, '-enc', 'UTF-8', '-eol', 'unix']
    if layout:
        args.append('-layout')
    # Some Windows Poppler builds cannot create files at long corpus paths.
    # File-handle input and stdout keep those paths in Python's file layer.
    with source.open('rb') as original:
        result = subprocess.run([*args, '-', '-'], stdin=original, check=True, capture_output=True, timeout=1800)
    file.write_bytes(result.stdout)
    pages = file.read_text(encoding='utf-8').split('\f')
    if pages and not pages[-1].strip():
        pages.pop()
    if len(pages) != page_count:
        raise RuntimeError(f'Poppler page-boundary count {len(pages)} differs from original PDF count {page_count}.')
    result = subprocess.run([executable, '-v'], capture_output=True, timeout=20)
    tool_version = (result.stderr or result.stdout).decode('utf-8', errors='replace').splitlines()[0]
    return pages, file, tool_version


def extract_pdf(source, output, options, add, loc, limitations):
    import pypdfium2 as pdfium

    profile = options.get('pdf_profile', 'technical')
    if profile not in ('technical', 'prose', 'ocr'):
        raise ValueError('pdf_profile must be technical, prose or ocr')
    settings = dict(pdf_profile=profile, image_scale=1.5, threads=4, device='cpu',
                    formula_enrichment=False, full_page_ocr=profile == 'ocr')
    artifacts = []
    versions = {'pypdfium2': version('pypdfium2')}
    with source.open('rb') as original, pdfium.PdfDocument(original) as pdf:
        count = len(pdf)
        flow, flow_file, versions['poppler'] = poppler_pages(source, output, count, executable=options.get('pdftotext'))
        layout, layout_file, _ = poppler_pages(source, output, count, layout=True, executable=options.get('pdftotext'))
        artifacts.extend([flow_file, layout_file])
        for index in range(count):
            number = index + 1
            for name, content in [('poppler-flow', flow[index]), ('poppler-layout', layout[index])]:
                add('text', content, loc('pages', f'Physical PDF page {number}: {name}', number, number, anchor=name),
                    details=dict(representation=name, page_boundary='Poppler form-feed checked against original page count'))
                if '\ufffd' in content:
                    limitations.append(f'{name} page {number} contains replacement characters; inspect original glyphs.')
            if not flow[index].strip() and not layout[index].strip():
                limitations.append(f'Physical page {number} has no Poppler text. It may be blank, scanned or visual; inspect it and use OCR when needed.')
            page = pdf[index]
            width, height = page.get_size()
            if width * height * settings['image_scale'] ** 2 > 60_000_000:
                raise ValueError(f'Physical page {number} exceeds the render pixel limit.')
            bitmap = page.render(scale=settings['image_scale'])
            image = bitmap.to_pil()
            file = output / f'page-{number:04d}.png'
            image.save(file)
            image.close(); bitmap.close(); page.close()
            add('figure', 'Original page image: inspect consequential tables, formulas, labels, code and diagrams.',
                loc('pages', f'Physical PDF page {number}: visual', number, number, anchor='visual'), file.name,
                details=dict(representation='original-page-render', scale=settings['image_scale']))

    if profile != 'prose':
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions, OcrMode
        from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
        pipeline = PdfPipelineOptions()
        pipeline.accelerator_options = AcceleratorOptions(num_threads=4, device=AcceleratorDevice.CPU)
        pipeline.do_formula_enrichment = False
        pipeline.generate_page_images = False
        pipeline.generate_picture_images = False
        if profile == 'ocr':
            pipeline.ocr_options.mode = OcrMode.FULL_PAGE
        converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)})
        doc = converter.convert(source).document
        versions.update({'docling': version('docling'), 'docling-core': version('docling-core')})
        settings['docling_pipeline'] = json.loads(pipeline.model_dump_json())
        raw_json, raw_md = output / 'docling.json', output / 'docling.md'
        raw_json.write_text(json.dumps(doc.export_to_dict(), ensure_ascii=False, indent=2), encoding='utf-8')
        raw_md.write_text(doc.export_to_markdown(), encoding='utf-8')
        artifacts.extend([raw_json, raw_md])
        pages, ranges = project_docling_pages(doc)
        for number in range(1, count + 1):
            parts = pages.get(number, [])
            text = '\n\n'.join(part['text'] for part in parts)
            add('text', text, loc('pages', f'Physical PDF page {number}: Docling', number, number, anchor='docling'),
                details=dict(representation='docling-page-projection', provenance=[{k: v for k, v in part.items() if k != 'text'} for part in parts],
                             fidelity='Alternative extracted reading; verify against the original image.'))
            if not text.strip():
                limitations.append(f'Docling supplied no exact-page text for physical page {number}; inspect the image and any spanning units.')
            if 'formula-not-decoded' in text or '\ufffd' in text:
                limitations.append(f'Docling page {number} contains undecoded formula/glyph markers; inspect the original.')
        for item in ranges:
            numbers = item['pages']
            # An unlocated item remains available, but cannot acquire an exact page claim.
            locator = loc('pages', 'Docling item with unresolved page split',
                          min(numbers) if numbers else 1, max(numbers) if numbers else count,
                          anchor='docling-range:' + item['item_ref'])
            locator['precision'] = 'approximate'
            add('text', item['text'], locator, details=item)
            limitations.append(item['limitation'] + ' ' + item['item_ref'])
    limitations.append('Parser agreement does not establish fidelity. Check consequential labels, cells, symbols and quotations against original-page images; keep AI reconstructions separate.')
    metadata = dict(settings=settings, tool_versions=versions,
                    raw_artifacts=[dict(path=p.name, sha256=file_hash(p)) for p in artifacts])
    (output / 'extraction-settings.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    return dict(parser='pdf-complementary-2', **metadata)
