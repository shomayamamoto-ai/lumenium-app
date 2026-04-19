"""Tests for clean_srt.py. Stdlib-only; run with `python3 -m unittest`."""
from __future__ import annotations

import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import clean_srt as m  # noqa: E402


def pipeline(src: str, lang: str = "ja") -> list[m.Cue]:
    cues = m.parse_srt(src)
    cues = [m.Cue(c.index, c.start, c.end, m.normalise_text(c.text)) for c in cues]
    cues = m.strip_hallucinations(cues, lang)
    cues = m.dedupe_consecutive(cues)
    cues = m.merge_too_short(cues)
    cues = m.split_too_long(cues)
    return m.reindex(cues)


class ParseTest(unittest.TestCase):
    def test_basic(self):
        src = "1\n00:00:01,000 --> 00:00:02,000\nhello\n"
        cues = m.parse_srt(src)
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "hello")
        self.assertAlmostEqual(cues[0].start, 1.0)
        self.assertAlmostEqual(cues[0].end, 2.0)

    def test_missing_index_line(self):
        src = "00:00:01,000 --> 00:00:02,000\nhello\n"
        cues = m.parse_srt(src)
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "hello")

    def test_crlf_and_bom(self):
        src = "\ufeff1\r\n00:00:01,000 --> 00:00:02,000\r\nhi\r\n"
        cues = m.parse_srt(src)
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "hi")


class TimeFormatTest(unittest.TestCase):
    def test_roundtrip(self):
        self.assertEqual(m.fmt_time(0), "00:00:00,000")
        self.assertEqual(m.fmt_time(3661.25), "01:01:01,250")

    def test_ms_rounding_carry(self):
        # 0.9995 would naively format as ",1000" — must carry.
        self.assertEqual(m.fmt_time(0.9995), "00:00:01,000")


class HallucinationTest(unittest.TestCase):
    def test_strips_trailing_ja_hallucination(self):
        src = (
            "1\n00:00:00,000 --> 00:00:02,000\n本編です\n\n"
            "2\n00:00:02,000 --> 00:00:04,000\nご視聴ありがとうございました\n"
        )
        cues = pipeline(src, "ja")
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "本編です")

    def test_strips_en_thanks_for_watching(self):
        src = (
            "1\n00:00:00,000 --> 00:00:02,000\nreal content\n\n"
            "2\n00:00:02,000 --> 00:00:04,000\nThanks for watching.\n"
        )
        cues = pipeline(src, "en")
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "real content")


class DedupeTest(unittest.TestCase):
    def test_merges_consecutive_duplicates(self):
        src = (
            "1\n00:00:00,000 --> 00:00:01,000\nhello\n\n"
            "2\n00:00:01,000 --> 00:00:02,000\nhello\n"
        )
        cues = pipeline(src, "en")
        self.assertEqual(len(cues), 1)
        self.assertAlmostEqual(cues[0].start, 0.0)
        self.assertAlmostEqual(cues[0].end, 2.0)


class MergeShortTest(unittest.TestCase):
    def test_orphan_leading_short_cue_merges_forward(self):
        src = (
            "1\n00:00:00,000 --> 00:00:00,200\nあ\n\n"
            "2\n00:00:00,200 --> 00:00:02,000\n本編\n"
        )
        cues = pipeline(src, "ja")
        self.assertEqual(len(cues), 1)
        self.assertIn("あ", cues[0].text)
        self.assertIn("本編", cues[0].text)

    def test_trailing_short_cue_merges_backward(self):
        src = (
            "1\n00:00:00,000 --> 00:00:02,000\n本編\n\n"
            "2\n00:00:02,000 --> 00:00:02,200\nあ\n"
        )
        cues = pipeline(src, "ja")
        self.assertEqual(len(cues), 1)
        self.assertAlmostEqual(cues[0].end, 2.2)


class SplitLongTest(unittest.TestCase):
    def test_splits_on_japanese_period(self):
        # Must exceed MAX_CHARS (42) so split_too_long actually activates.
        text = (
            "一文目はそれなりに長い文章で読点も含みます。"
            "二文目も同じくらい長めにしておきますね。"
            "三文目もついでに長めの文章にしておきます。"
        )
        assert len(text) > m.MAX_CHARS, "fixture must exceed MAX_CHARS"
        src = f"1\n00:00:00,000 --> 00:00:09,000\n{text}\n"
        cues = pipeline(src, "ja")
        self.assertEqual(len(cues), 3)
        self.assertAlmostEqual(cues[-1].end, 9.0, places=3)
        for c in cues:
            self.assertLess(c.start, c.end)

    def test_keeps_short_cues_intact(self):
        src = "1\n00:00:00,000 --> 00:00:02,000\n短い行\n"
        cues = pipeline(src, "ja")
        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "短い行")


class NormaliseTest(unittest.TestCase):
    def test_full_width_space_collapsed(self):
        self.assertEqual(m.normalise_text("あ\u3000 い"), "あ  い".replace("  ", " "))


if __name__ == "__main__":
    unittest.main()
