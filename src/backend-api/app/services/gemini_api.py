from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class GeminiGroundingSource:
    source_id: str
    title: str
    uri: str | None
    domain: str | None


def build_text_part(text: str) -> dict[str, str]:
    return {"text": text}


def build_text_content(role: str, text: str) -> dict[str, Any]:
    return {
        "role": role,
        "parts": [build_text_part(text)],
    }


def build_google_search_tool() -> dict[str, dict[str, str]]:
    return {"google_search": {}}


def extract_first_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    candidates = payload.get("candidates") or []
    if not candidates:
        prompt_feedback = payload.get("promptFeedback") or {}
        block_reason = prompt_feedback.get("blockReason")
        if block_reason:
            raise RuntimeError(f"Gemini response was blocked: {block_reason}.")
        raise RuntimeError("Gemini response did not include any candidates.")
    return candidates[0]


def extract_text_from_response(payload: dict[str, Any]) -> str:
    content = (extract_first_candidate(payload).get("content") or {})
    parts = content.get("parts") or []
    texts = [
        str(part.get("text", "")).strip()
        for part in parts
        if isinstance(part, dict) and str(part.get("text", "")).strip()
    ]
    if not texts:
        raise RuntimeError("Gemini response content was empty.")
    return "\n".join(texts).strip()


def extract_grounding_sources(payload: dict[str, Any]) -> list[GeminiGroundingSource]:
    grounding_metadata = (
        extract_first_candidate(payload).get("groundingMetadata") or {}
    )
    grounding_chunks = grounding_metadata.get("groundingChunks") or []

    sources: list[GeminiGroundingSource] = []
    seen_keys: set[str] = set()
    source_index = 1

    for chunk in grounding_chunks:
        if not isinstance(chunk, dict):
            continue

        web = chunk.get("web") or {}
        if not isinstance(web, dict):
            continue

        uri = str(web.get("uri") or "").strip() or None
        title = str(web.get("title") or "").strip()
        domain = urlparse(uri).netloc if uri else None
        if not title:
            title = domain or f"联网来源 {source_index}"

        dedup_key = uri or title
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        sources.append(
            GeminiGroundingSource(
                source_id=f"WEB_{source_index:03d}",
                title=title,
                uri=uri,
                domain=domain,
            )
        )
        source_index += 1

    return sources


def call_gemini_generate_content_raw(
    settings: Any,
    *,
    model_name: str,
    contents: list[dict[str, Any]],
    system_instruction: str | None = None,
    temperature: float = 0.7,
    max_output_tokens: int = 2048,
    tools: list[dict[str, Any]] | None = None,
    response_mime_type: str | None = None,
) -> dict[str, Any]:
    if not settings.gemini_api_key:
        raise RuntimeError("Gemini API key is not configured.")

    endpoint = f"{settings.gemini_base_url.rstrip('/')}/models/{model_name}:generateContent"
    payload: dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }
    if response_mime_type:
        payload["generationConfig"]["responseMimeType"] = response_mime_type
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [build_text_part(system_instruction)],
        }
    if tools:
        payload["tools"] = tools

    request = Request(
        endpoint,
        method="POST",
        headers={
            "x-goog-api-key": settings.gemini_api_key,
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
    )

    try:
        with urlopen(request, timeout=settings.gemini_timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:  # pragma: no cover - network path
        error_body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"Gemini request failed with status {error.code}: {error_body}"
        ) from error
    except URLError as error:  # pragma: no cover - network path
        raise RuntimeError(f"Gemini request failed: {error.reason}") from error

    return response_payload


def call_gemini_generate_content(
    settings: Any,
    *,
    model_name: str,
    contents: list[dict[str, Any]],
    system_instruction: str | None = None,
    temperature: float = 0.7,
    max_output_tokens: int = 2048,
    tools: list[dict[str, Any]] | None = None,
    response_mime_type: str | None = None,
) -> str:
    response_payload = call_gemini_generate_content_raw(
        settings=settings,
        model_name=model_name,
        contents=contents,
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        tools=tools,
        response_mime_type=response_mime_type,
    )
    return extract_text_from_response(response_payload)
