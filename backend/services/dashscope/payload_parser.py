from __future__ import annotations

from typing import Any

from services.base import SpeakerSegment


class DashScopePayloadParser:
    def collect_segment_candidates(self, payload: Any) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []

        if isinstance(payload, dict):
            maybe_sentences = payload.get("sentences") or payload.get("segments")
            if isinstance(maybe_sentences, list):
                candidates.extend(item for item in maybe_sentences if isinstance(item, dict))

            for key in ("transcripts", "results", "output"):
                nested = payload.get(key)
                if isinstance(nested, list):
                    for item in nested:
                        candidates.extend(self.collect_segment_candidates(item))
                elif isinstance(nested, dict):
                    candidates.extend(self.collect_segment_candidates(nested))
        elif isinstance(payload, list):
            for item in payload:
                candidates.extend(self.collect_segment_candidates(item))

        return candidates

    @staticmethod
    def _pick_first_defined(data: dict[str, Any], keys: tuple[str, ...]) -> Any:
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        return None

    def extract_segments(self, payload: Any) -> list[SpeakerSegment]:
        if not payload:
            return []

        parsed: list[SpeakerSegment] = []
        for item in self.collect_segment_candidates(payload):
            speaker_raw = self._pick_first_defined(item, ("speaker_id", "speakerId", "speaker", "spk"))
            text = str(item.get("text") or item.get("transcript") or "").strip()
            start_raw = self._pick_first_defined(item, ("start_ms", "begin_time", "start_time", "start"))
            end_raw = self._pick_first_defined(item, ("end_ms", "end_time", "stop_time", "end"))

            if speaker_raw is None or not text:
                continue

            try:
                start_ms = int(float(start_raw))
                end_ms = int(float(end_raw))
            except (TypeError, ValueError):
                continue
            if end_ms < start_ms:
                continue

            parsed.append(
                SpeakerSegment(
                    speaker_id=str(speaker_raw),
                    start_ms=start_ms,
                    end_ms=end_ms,
                    text=text,
                )
            )

        return parsed

    @staticmethod
    def normalize_and_merge_segments(segments: list[SpeakerSegment]) -> list[SpeakerSegment]:
        """保留句级说话人切片，只合并真正重复或重叠的片段。"""
        if not segments:
            return []

        sorted_segments = sorted(segments, key=lambda s: (s.start_ms, s.end_ms))
        merged: list[SpeakerSegment] = []
        for segment in sorted_segments:
            if not merged:
                merged.append(segment)
                continue

            last = merged[-1]
            if (
                segment.speaker_id == last.speaker_id
                and segment.start_ms < last.end_ms
                and segment.text == last.text
            ):
                merged[-1] = SpeakerSegment(
                    speaker_id=last.speaker_id,
                    start_ms=last.start_ms,
                    end_ms=max(last.end_ms, segment.end_ms),
                    text=f"{last.text}{segment.text}",
                )
                continue

            merged.append(segment)

        return merged

    def extract_text(self, payload: Any) -> str:
        if isinstance(payload, dict):
            maybe_transcripts = payload.get("transcripts")
            if isinstance(maybe_transcripts, list):
                text = "".join(
                    self.extract_text(item)
                    for item in maybe_transcripts
                    if isinstance(item, dict)
                )
                if text:
                    return text

            for key in ("transcript", "text", "result"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

            maybe_sentences = payload.get("sentences") or payload.get("segments")
            if isinstance(maybe_sentences, list):
                return "".join(
                    str(item.get("text") or item.get("transcript") or "").strip()
                    for item in maybe_sentences
                    if isinstance(item, dict) and (item.get("text") or item.get("transcript"))
                )

            for key in ("results", "output"):
                nested = payload.get(key)
                if isinstance(nested, list):
                    text = "".join(
                        self.extract_text(item)
                        for item in nested
                        if isinstance(item, dict)
                    )
                    if text:
                        return text
                elif isinstance(nested, dict):
                    text = self.extract_text(nested)
                    if text:
                        return text

        elif isinstance(payload, list):
            return "".join(
                self.extract_text(item)
                for item in payload
                if isinstance(item, dict)
            )

        return ""
