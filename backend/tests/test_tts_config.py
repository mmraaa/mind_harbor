from app.adapters import tts
from app.services.api_config import ResolvedService


def test_tts_reads_managed_service_configuration(monkeypatch):
    managed = ResolvedService(
        "tts", "语音陪伴", True, "managed-key", "https://tts.example.test/v1", "managed-tts-model"
    )
    monkeypatch.setattr(tts, "resolve_service", lambda _: managed)

    assert tts._client_config() is managed
