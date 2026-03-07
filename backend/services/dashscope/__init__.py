"""DashScope STT internal modules."""

from .strategies import (
    DashScopeAutoRecognitionStrategy,
    DashScopeFileRecognitionStrategy,
    DashScopeRealtimeRecognitionStrategy,
    DashScopeTranscriptionStrategy,
)

__all__ = [
    "DashScopeAutoRecognitionStrategy",
    "DashScopeFileRecognitionStrategy",
    "DashScopeRealtimeRecognitionStrategy",
    "DashScopeTranscriptionStrategy",
]
