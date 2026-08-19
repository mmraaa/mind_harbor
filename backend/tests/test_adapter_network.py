from app.adapters import embedding, llm
from app.services.api_config import ResolvedService


class _Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": "ok"}}]}


def test_llm_non_stream_requests_bypass_stale_system_proxy(monkeypatch):
    seen = {}

    def fake_post(*args, **kwargs):
        seen.update(kwargs)
        return _Response()

    monkeypatch.setattr(llm, "resolve_service", lambda _: ResolvedService("llm", "对话模型", True, "key", "https://example.test/v1", "model"))
    monkeypatch.setattr(llm.httpx, "post", fake_post)
    assert llm._chat_completion({"model": "model", "messages": [], "stream": False}) == "ok"
    assert seen["trust_env"] is False


def test_llm_stream_requests_bypass_stale_system_proxy(monkeypatch):
    seen = {}

    class StreamResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def raise_for_status(self):
            return None

        def iter_lines(self):
            return ["data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}", "data: [DONE]"]

    def fake_stream(*args, **kwargs):
        seen.update(kwargs)
        return StreamResponse()

    monkeypatch.setattr(llm, "resolve_service", lambda _: ResolvedService("llm", "对话模型", True, "key", "https://example.test/v1", "model"))
    monkeypatch.setattr(llm.httpx, "stream", fake_stream)
    assert "".join(llm.stream_chat([])) == "ok"
    assert seen["trust_env"] is False


def test_embedding_requests_bypass_stale_system_proxy(monkeypatch):
    seen = {}

    def fake_post(*args, **kwargs):
        seen.update(kwargs)
        response = _Response()
        response.json = lambda: {"data": [{"embedding": [1.0]}]}
        return response

    monkeypatch.setattr(embedding.httpx, "post", fake_post)
    monkeypatch.setattr(embedding, "resolve_service", lambda _: ResolvedService("embedding", "向量模型", True, "key", "https://example.test/v1", "model"))
    assert embedding.embed(["hello"]) == [[1.0]]
    assert seen["trust_env"] is False


def test_stream_chat_applies_configured_output_and_context_limits(monkeypatch):
    seen = {}
    usage = []

    class StreamResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def raise_for_status(self):
            return None

        def iter_lines(self):
            return ["data: [DONE]"]

    def fake_stream(*args, **kwargs):
        seen.update(kwargs)
        return StreamResponse()

    config = ResolvedService(
        "llm", "对话模型", True, "key", "https://example.test/v1", "model",
        context_window=256, max_tokens=64,
    )
    monkeypatch.setattr(llm, "resolve_service", lambda _: config)
    monkeypatch.setattr(llm.httpx, "stream", fake_stream)
    monkeypatch.setattr(llm, "record_usage", lambda service_id, **kwargs: usage.append((service_id, kwargs)))
    list(llm.stream_chat([
        {"role": "system", "content": "系统提示"},
        {"role": "user", "content": "x" * 1000},
    ]))

    assert seen["json"]["max_tokens"] == 64
    assert len(seen["json"]["messages"][1]["content"]) <= 384
    assert seen["json"]["messages"][1]["content"].endswith("x")
    assert usage == [("llm", {"prompt_tokens": 0, "completion_tokens": 0})]
