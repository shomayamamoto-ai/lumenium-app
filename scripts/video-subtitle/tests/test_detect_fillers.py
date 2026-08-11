"""Tests for detect_fillers.py. Stdlib-only; run with `python3 -m unittest`."""
from __future__ import annotations

import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import detect_fillers as df  # noqa: E402


def w(start: float, end: float, word: str, prob: float = 0.9) -> dict:
    return {"start": start, "end": end, "word": word, "probability": prob}


class FillerTest(unittest.TestCase):
    def test_picks_up_basic_japanese_filler(self):
        words = [w(0.0, 0.3, "えー"), w(0.4, 1.0, "始めます")]
        cuts = df.detect(words, dictionary=df.CONSERVATIVE_FILLERS)
        self.assertEqual(len(cuts), 1)
        self.assertEqual(cuts[0].reason, "filler")
        self.assertEqual(cuts[0].text, "えー")

    def test_does_not_cut_meaningful_word_in_conservative_mode(self):
        # "あの" is meaningful ("that"), so the conservative dictionary leaves it alone.
        words = [w(0.0, 0.4, "あの"), w(0.5, 1.0, "人")]
        cuts = df.detect(words, dictionary=df.CONSERVATIVE_FILLERS)
        self.assertEqual(cuts, [])

    def test_aggressive_mode_does_cut_ano(self):
        words = [w(0.0, 0.4, "あの"), w(0.5, 1.0, "人")]
        cuts = df.detect(words, dictionary=df.AGGRESSIVE_FILLERS)
        self.assertEqual(len(cuts), 1)
        self.assertEqual(cuts[0].text, "あの")

    def test_normalises_long_vowel_variants(self):
        words = [w(0.0, 0.4, "えーっと"), w(0.5, 1.0, "次")]
        cuts = df.detect(words, dictionary=df.CONSERVATIVE_FILLERS)
        self.assertEqual(len(cuts), 1)


class StutterTest(unittest.TestCase):
    def test_collapses_three_consecutive_repeats(self):
        # "あの あの あの 始めます" — drop the first two, keep last + content.
        words = [
            w(0.0, 0.3, "あの"),
            w(0.4, 0.7, "あの"),
            w(0.8, 1.1, "あの"),
            w(1.2, 2.0, "始めます"),
        ]
        cuts = df.detect(words, dictionary=set(), detect_stutters=True)
        # Cuts cover the first two "あの" but not the last one or the content.
        self.assertEqual(len(cuts), 2)
        self.assertTrue(all(c.reason == "stutter" for c in cuts))
        for c in cuts:
            self.assertLess(c.end, words[2]["start"])  # all before the kept "あの"

    def test_two_repeats_left_alone(self):
        # Threshold is 3; two reps is normal emphasis.
        words = [w(0.0, 0.3, "あの"), w(0.4, 0.7, "あの"), w(0.8, 1.5, "始めます")]
        cuts = df.detect(words, dictionary=set(), detect_stutters=True)
        self.assertEqual(cuts, [])

    def test_repeats_separated_by_long_gap_not_a_stutter(self):
        words = [w(0.0, 0.3, "あの"), w(2.0, 2.3, "あの"), w(2.4, 3.0, "あの")]
        cuts = df.detect(words, dictionary=set(), detect_stutters=True)
        # First "あの" gap to second is > STUTTER_GAP, so the run resets.
        # Only second+third are within window — that's 2, not 3 → no cut.
        self.assertEqual(cuts, [])


class SilenceTest(unittest.TestCase):
    def test_long_silence_trimmed_when_threshold_set(self):
        words = [w(0.0, 1.0, "始めます"), w(5.0, 6.0, "次")]
        cuts = df.detect(words, dictionary=set(), silence_threshold=2.0)
        self.assertEqual(len(cuts), 1)
        self.assertEqual(cuts[0].reason, "long_silence")
        # We trim down to LONG_SILENCE_KEEP (~0.3s); cut should be ~3.7s long.
        self.assertAlmostEqual(cuts[0].end - cuts[0].start, 4.0 - 0.3, places=2)

    def test_silence_below_threshold_left_alone(self):
        words = [w(0.0, 1.0, "始めます"), w(2.0, 3.0, "次")]
        cuts = df.detect(words, dictionary=set(), silence_threshold=2.0)
        self.assertEqual(cuts, [])

    def test_silence_off_by_default(self):
        words = [w(0.0, 1.0, "始めます"), w(10.0, 11.0, "次")]
        cuts = df.detect(words, dictionary=set())
        self.assertEqual(cuts, [])


class ExcludesTest(unittest.TestCase):
    def test_exclude_protects_a_range(self):
        words = [w(0.0, 0.3, "えー"), w(2.0, 2.3, "えー")]
        cuts = df.detect(words, dictionary=df.CONSERVATIVE_FILLERS)
        self.assertEqual(len(cuts), 2)
        cuts = df.apply_excludes(cuts, [(0.0, 1.0)])
        self.assertEqual(len(cuts), 1)
        self.assertGreater(cuts[0].start, 1.0)


class MergeOverlapTest(unittest.TestCase):
    def test_overlapping_cuts_merge(self):
        words = [w(0.0, 0.3, "えー"), w(0.31, 0.5, "えーと")]
        cuts = df.detect(words, dictionary=df.CONSERVATIVE_FILLERS)
        # Both cuts overlap due to padding — should collapse to one.
        self.assertEqual(len(cuts), 1)
        self.assertGreater(cuts[0].end - cuts[0].start, 0.4)


if __name__ == "__main__":
    unittest.main()
