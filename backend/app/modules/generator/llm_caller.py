"""
LLM provider dispatching — pure I/O, no business logic.

Public interface:
  call(provider, prompt, system, image_bytes?) → CallResult(text, prompt_tokens, completion_tokens)
  parse_json(text)                              → dict

Each stage in the pipeline supplies its OWN system prompt so Gemini, GPT-4o,
and Claude each adopt the correct role (BA / QA Engineer / Reviewer).
google-genai SDK is async-native; asyncio is only used in the retry helper.
"""

import asyncio
import base64
import json
import logging
import re
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Retry helper ──────────────────────────────────────────────────────────────
# Retries on transient server-side errors (overloaded, rate-limited, 5xx).
# Max 3 attempts; delays: 5s → 15s.

_RETRY_DELAYS = (5, 15, 30)


async def _with_retry(coro_fn, *args, **kwargs):
    last_exc: Exception | None = None
    retries = 0
    for delay in (*_RETRY_DELAYS, None):
        try:
            result = await coro_fn(*args, **kwargs)
            result.retry_count = retries
            return result
        except Exception as exc:
            msg = str(exc).lower()
            # Retry only on transient capacity / rate-limit errors.
            if any(k in msg for k in ("overloaded", "529", "rate_limit", "503", "502", "resource_exhausted", "quota", "429")):
                last_exc = exc
                retries += 1
                if delay is not None:
                    await asyncio.sleep(delay)
                continue
            raise  # non-retryable — propagate immediately
    # Attach retry count so _call_with_fallback can read it from the exception.
    last_exc._retry_count = retries  # type: ignore[union-attr]
    raise last_exc  # type: ignore[misc]


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class CallResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    truncated: bool = False
    retry_count: int = 0  # transient retries before this result (set by _with_retry)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


# ── Image helpers ─────────────────────────────────────────────────────────────

def _detect_mime(data: bytes) -> str:
    """Detect image MIME type from magic bytes."""
    if data[:4] == b'\x89PNG':                      return "image/png"
    if data[:3] == b'\xff\xd8\xff':                 return "image/jpeg"
    if data[:6] in (b'GIF87a', b'GIF89a'):          return "image/gif"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP': return "image/webp"
    return "image/jpeg"


# ── Public API ────────────────────────────────────────────────────────────────


async def call(
    provider: str,
    prompt: str,
    system: str,
    image_bytes: bytes | None = None,
    model_override: str | None = None,
) -> CallResult:
    """
    Dispatch to the correct LLM provider and return CallResult with text + token usage.
    Automatically retries on transient overloaded / rate-limit errors (up to 3 attempts).

    Args:
        provider:       "openai" | "gemini" | "claude"
        prompt:         User-turn content (built by prompts.py)
        system:         System-turn content (role persona, also from prompts.py)
        image_bytes:    Optional raw image bytes for vision-enabled calls
        model_override: Override the default model for this provider
    """
    if provider == "openai":
        return await _with_retry(_openai, prompt, system, image_bytes)
    if provider == "gemini":
        return await _with_retry(_gemini, prompt, system, image_bytes)
    if provider == "claude":
        return await _with_retry(_claude, prompt, system, image_bytes, model_override)
    raise ValueError(f"Unknown LLM provider: '{provider}'")


def strip_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ``` or ``` ... ```) and trim whitespace.

    Used to sanitize intermediate LLM outputs before embedding them in the next
    stage's prompt, in case a model ignores the 'no markdown' instruction.
    """
    return re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()


def parse_json(text: str) -> dict:
    """Strip optional markdown fences, sanitize escape sequences, then parse JSON.

    Falls back to json_repair for malformed LLM output (trailing commas, JS comments,
    unquoted keys, single-quoted strings, etc.) that regex pre-processing cannot catch.
    """
    cleaned = re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()
    # LLMs sometimes emit invalid JSON escape sequences such as \( \- \. \, etc.
    # Replace any backslash NOT followed by a valid JSON escape character with \\.
    sanitized = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', cleaned)
    # LLMs sometimes emit trailing commas before } or ] which are invalid in JSON.
    sanitized = re.sub(r',\s*([}\]])', r'\1', sanitized)
    try:
        return json.loads(sanitized)
    except json.JSONDecodeError:
        from json_repair import repair_json  # lazy import — only on failure
        logger.warning(
            "LLM output is malformed JSON — falling back to json_repair. "
            "This usually indicates output truncation (hit max_tokens limit)."
        )
        return json.loads(repair_json(sanitized))


# ── Provider implementations ──────────────────────────────────────────────────


async def _openai(prompt: str, system: str, image_bytes: bytes | None = None) -> CallResult:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    if image_bytes:
        mime = _detect_mime(image_bytes)
        b64  = base64.standard_b64encode(image_bytes).decode()
        user_content: object = [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            {"type": "text", "text": prompt},
        ]
    else:
        user_content = prompt

    resp = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    usage = resp.usage
    return CallResult(
        text=resp.choices[0].message.content or "",
        prompt_tokens=usage.prompt_tokens if usage else 0,
        completion_tokens=usage.completion_tokens if usage else 0,
    )


async def _gemini(prompt: str, system: str, image_bytes: bytes | None = None) -> CallResult:
    import io

    from google import genai
    from google.genai import types
    from PIL import Image as PILImage

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.3,
        max_output_tokens=65536,
        # Disable thinking: the pipeline's multi-stage design (BA→QA→Reviewer)
        # already provides structured reasoning. thinking_budget=0 is the only
        # reliable way to prevent thinking tokens from consuming output budget.
        # Previously google-generativeai==0.8.6 silently ignored thinking_config,
        # causing consistent truncation and fallback to OpenAI.
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

    if image_bytes:
        pil_image = PILImage.open(io.BytesIO(image_bytes))
        contents = [pil_image, prompt]
    else:
        contents = prompt

    # google-genai SDK is async-native — no thread pool needed.
    resp = await client.aio.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=contents,
        config=config,
    )

    meta = resp.usage_metadata
    prompt_tokens     = getattr(meta, "prompt_token_count",     0) or 0
    completion_tokens = getattr(meta, "candidates_token_count", 0) or 0

    # Detect truncation: finish_reason "MAX_TOKENS" means output was cut short.
    candidate = resp.candidates[0] if resp.candidates else None
    finish_reason = str(getattr(candidate, "finish_reason", "")) if candidate else ""

    # resp.text can be None when safety filters block output or content is empty.
    raw_text: str = ""
    try:
        raw_text = resp.text or ""
    except Exception:
        pass

    if "MAX_TOKENS" in finish_reason:
        logger.warning(
            "Gemini (%s) hit max_output_tokens (%d tokens used). "
            "Salvaging partial output via json_repair.",
            settings.GEMINI_MODEL, completion_tokens,
        )
        return CallResult(
            text=raw_text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            truncated=True,
        )

    return CallResult(
        text=raw_text,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


_CLAUDE_MAX_TOKENS = 49152


async def _claude(prompt: str, system: str, image_bytes: bytes | None = None, model_override: str | None = None) -> CallResult:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = model_override or settings.CLAUDE_MODEL

    # System prompt is always static — mark it cacheable.
    cached_system = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]

    # User content: when an image is present its base64 payload is unique per upload
    # so caching the text that follows it would never hit; skip cache_control in that case.
    if image_bytes:
        mime = _detect_mime(image_bytes)
        b64  = base64.standard_b64encode(image_bytes).decode()
        user_content: object = [
            {"type": "image", "source": {
                "type": "base64",
                "media_type": mime,
                "data": b64,
            }},
            {"type": "text", "text": prompt},
        ]
    else:
        # Mark the prompt text cacheable — repeated identical calls (same requirement,
        # same language) will hit the cache within the 5-minute TTL window.
        user_content = [{"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}]

    msg = await client.messages.create(
        model=model,
        max_tokens=_CLAUDE_MAX_TOKENS,
        system=cached_system,
        messages=[{"role": "user", "content": user_content}],
        temperature=0.3,
    )

    cache_read  = getattr(msg.usage, "cache_read_input_tokens",    0) or 0
    cache_write = getattr(msg.usage, "cache_creation_input_tokens", 0) or 0
    if cache_read or cache_write:
        logger.info(
            "Claude prompt-cache: read=%d write=%d (model=%s)",
            cache_read, cache_write, model,
        )

    # Detect truncation — salvage whatever was generated rather than failing entirely.
    # json_repair (called inside parse_json) will close unclosed arrays/objects and
    # return the test cases that were fully written before the token budget ran out.
    # No retry → no extra cost.
    if msg.stop_reason == "max_tokens":
        partial_text = msg.content[0].text if msg.content else "{}"
        logger.warning(
            "Claude (%s) hit max_tokens limit (output_tokens=%d/%d). "
            "Salvaging partial output via json_repair — result may contain "
            "fewer test cases than requested.",
            model, msg.usage.output_tokens, _CLAUDE_MAX_TOKENS,
        )
        return CallResult(
            text=partial_text,
            prompt_tokens=msg.usage.input_tokens,
            completion_tokens=msg.usage.output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            truncated=True,
        )

    return CallResult(
        text=msg.content[0].text,
        prompt_tokens=msg.usage.input_tokens,
        completion_tokens=msg.usage.output_tokens,
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
    )
