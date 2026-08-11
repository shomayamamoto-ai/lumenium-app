"""Tests for apply_cuts.py — SRT timestamp shifting and keep-range math.

The ffmpeg side is exercised in integration; here we just verify the
deterministic logic that gets edits right or wrong.
"""
from __future__ import annotations

import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import apply_cuts as ac  # noqa: E402
import clean_srt as cs   # noqa: E402


class KeepRangesTest(unittest.TestCase):
    def test_no_cuts(self):
        self.assertEqual(ac.keep_ranges([], 10.0), [(0.0, 10.0)])

    def test_single_cut_in_middle(self):
        cuts = [{"start": 3.0, "end": 5.0}]
        self.assertEqual(ac.keep_ranges(cuts, 10.0), [(0.0, 3.0), (5.0, 10.0)])

    def test_cut_at_start(self):
        cuts = [{"start": 0.0, "end": 2.0}]
        self.assertEqual(ac.keep_ranges(cuts, 10.0), [(2.0, 10.0)])

    def test_cut_at_end(self):
        cuts = [{"start": 8.0, "end": 10.0}]
        self.assertEqual(ac.keep_ranges(cuts, 10.0), [(0.0, 8.0)])

    def test_overlapping_cuts_collapsed(self):
        cuts = [{"start": 1.0, "end": 4.0}, {"start": 3.0, "end": 6.0}]
        self.assertEqual(ac.keep_ranges(cuts, 10.0), [(0.0, 1.0), (6.0, 10.0)])

    def test_adjacent_cuts(self):
        cuts = [{"start": 1.0, "end": 2.0}, {"start": 2.0, "end": 3.0}]
        self.assertEqual(ac.keep_ranges(cuts, 10.0), [(0.0, 1.0), (3.0, 10.0)])


class SrtShiftTest(unittest.TestCase):
    def _cue(self, start: float, end: float, text: str = "x") -> cs.Cue:
        return cs.Cue(0, start, end, text)

    def test_cue_entirely_inside_cut_dropped(self):
        cues = [self._cue(3.0, 4.0, "dropped")]
        keeps = [(0.0, 2.0), (5.0, 10.0)]
        out = ac.shift_srt(cues, keeps)
        self.assertEqual(out, [])

    def test_cue_in_first_segment_preserved(self):
        cues = [self._cue(0.0, 1.5, "kept")]
        keeps = [(0.0, 2.0), (5.0, 10.0)]
        out = ac.shift_srt(cues, keeps)
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0].start, 0.0)
        self.assertAlmostEqual(out[0].end, 1.5)
        self.assertEqual(out[0].text, "kept")

    def test_cue_in_second_segment_shifted_by_cut_duration(self):
        # Cut is 3s long (2->5). A cue at 6.0->7.0 in original time should
        # land at 3.0->4.0 in cut time.
        cues = [self._cue(6.0, 7.0, "shifted")]
        keeps = [(0.0, 2.0), (5.0, 10.0)]
        out = ac.shift_srt(cues, keeps)
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0].start, 3.0)
        self.assertAlmostEqual(out[0].end, 4.0)

    def test_cue_straddling_cut_keeps_majority_side(self):
        # Cue 1.5->5.5; cut is 2->5. Pre-cut overlap = 0.5s, post-cut = 0.5s.
        # Majority isn't strictly larger; either side is acceptable as long
        # as the cue is preserved (not dropped) and timestamps map cleanly.
        cues = [self._cue(1.5, 5.5, "straddle")]
        keeps = [(0.0, 2.0), (5.0, 10.0)]
        out = ac.shift_srt(cues, keeps)
        self.assertEqual(len(out), 1)
        # Whichever side wins, mapped time must lie inside the cut timeline
        # (total duration = 7s after removing 3s).
        self.assertGreaterEqual(out[0].start, 0.0)
        self.assertLessEqual(out[0].end, 7.0)
        self.assertLess(out[0].start, out[0].end)

    def test_multiple_cues_renumbered(self):
        cues = [
            self._cue(0.0, 1.0, "a"),
            self._cue(3.0, 4.0, "dropped"),  # inside cut
            self._cue(6.0, 7.0, "b"),
            self._cue(8.0, 9.0, "c"),
        ]
        keeps = [(0.0, 2.0), (5.0, 10.0)]
        out = cs.reindex(ac.shift_srt(cues, keeps))
        self.assertEqual(len(out), 3)
        self.assertEqual([c.text for c in out], ["a", "b", "c"])
        self.assertEqual([c.index for c in out], [1, 2, 3])

    def test_no_cuts_passes_through(self):
        cues = [self._cue(0.0, 1.0, "a"), self._cue(2.0, 3.0, "b")]
        out = ac.shift_srt(cues, [(0.0, 5.0)])
        self.assertEqual(len(out), 2)


if __name__ == "__main__":
    unittest.main()
