"""Verify source record coverage without external PDFs or private Git history."""
from pathlib import Path
import collections, json, unittest

ROOT=Path(__file__).resolve().parents[1]

class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'app/assets/content.json').read_text(encoding='utf8'))

    def test_counts_and_unique_ids(self):
        for key,count in [('words',959),('families',277),('questions',354)]:
            self.assertEqual(len(self.data[key]),count)
            self.assertEqual(len({x['id'] for x in self.data[key]}),count)

    def test_partition(self):
        counts=collections.Counter(w['day'] for w in self.data['words'])
        self.assertEqual([counts[n] for n in range(1,23)],[45]*21+[14])
        self.assertEqual(len({(w['day'],w['block']) for w in self.data['words']}),64)

    def test_verbatim_records(self):
        for key,file in [('words','vocab.md'),('questions','qn.md')]:
            source=(ROOT/'content'/file).read_text(encoding='utf8')
            for record in self.data[key]:
                self.assertIn(record['raw'],source)

    def test_answer_labels(self):
        for question in self.data['questions']:
            self.assertTrue(question['answers'])
            self.assertTrue(set(question['answers']) <= {c['label'] for c in question['choices']})

if __name__=='__main__':
    unittest.main()
