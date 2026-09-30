import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from pdf_extract import project_docling_pages
from docling_core.types.doc import DoclingDocument, DocItemLabel, ProvenanceItem, BoundingBox


class PageProvenance(unittest.TestCase):
    def document(self, spans):
        doc = DoclingDocument(name='synthetic-page-boundary')
        item = doc.add_text(label=DocItemLabel.TEXT, text='PAGE_ONE_TOKEN PAGE_TWO_TOKEN')
        item.prov = [ProvenanceItem(page_no=n, bbox=BoundingBox(l=0, t=0, r=100, b=100), charspan=span) for n, span in spans]
        return doc

    def test_actual_docling_multipage_item_is_split_using_character_provenance(self):
        doc = self.document([(1, (0, 14)), (2, (15, 29))])
        pages, ranges = project_docling_pages(doc)
        self.assertEqual(pages[1][0]['text'], 'PAGE_ONE_TOKEN')
        self.assertEqual(pages[2][0]['text'], 'PAGE_TWO_TOKEN')
        self.assertEqual(ranges, [])

    def test_ambiguous_overlapping_spans_never_get_false_single_page_attribution(self):
        doc = self.document([(1, (0, 29)), (2, (0, 29))])
        pages, ranges = project_docling_pages(doc)
        self.assertFalse(pages)
        self.assertEqual(ranges[0]['pages'], [1, 2])
        self.assertIn('PAGE_TWO_TOKEN', ranges[0]['text'])

    def test_missing_nonwhitespace_characters_require_range_review(self):
        doc = self.document([(1, (0, 4)), (2, (15, 29))])
        pages, ranges = project_docling_pages(doc)
        self.assertFalse(pages)
        self.assertEqual(len(ranges), 1)


if __name__ == '__main__':
    unittest.main()
