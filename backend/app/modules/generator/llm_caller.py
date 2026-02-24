"""
LLM provider dispatching — pure I/O, no business logic.

Public interface:
  call(provider, prompt, system) → CallResult(text, prompt_tokens, completion_tokens)
  parse_json(text)               → dict

Each stage in the pipeline supplies its OWN system prompt so Gemini, GPT-4o,
and Claude each adopt the correct role (BA / QA Engineer / Reviewer).
Uses asyncio.get_running_loop() — never the deprecated get_event_loop().
"""

import asyncio
import json
import re
from dataclasses import dataclass

from app.core.config import settings


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class CallResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


# ── Public API ────────────────────────────────────────────────────────────────


async def call(provider: str, prompt: str, system: str) -> CallResult:
    """
    Dispatch to the correct LLM provider and return CallResult with text + token usage.

    Args:
        provider: "openai" | "gemini" | "claude"
        prompt:   User-turn content (built by prompts.py)
        system:   System-turn content (role persona, also from prompts.py)
    """
    if provider == "openai":
        return await _openai(prompt, system)
    if provider == "gemini":
        return await _gemini(prompt, system)
    if provider == "claude":
        return await _claude(prompt, system)
    raise ValueError(f"Unknown LLM provider: '{provider}'")


def parse_json(text: str) -> dict:
    """Strip optional markdown fences, sanitize escape sequences, then parse JSON."""
    cleaned = re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()
    # LLMs sometimes emit invalid JSON escape sequences such as \( \- \. \, etc.
    # Replace any backslash NOT followed by a valid JSON escape character with \\.
    sanitized = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', cleaned)
    return json.loads(sanitized)


# ── Provider implementations ──────────────────────────────────────────────────


async def _openai(prompt: str, system: str) -> CallResult:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
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


async def _gemini(prompt: str, system: str) -> CallResult:
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=system,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json",
        ),
    )
    # Gemini SDK is synchronous — offload to thread pool.
    loop = asyncio.get_running_loop()
    resp = await loop.run_in_executor(None, model.generate_content, prompt)
    meta = getattr(resp, "usage_metadata", None)
    return CallResult(
        text=resp.text,
        prompt_tokens=getattr(meta, "prompt_token_count", 0) or 0,
        completion_tokens=getattr(meta, "candidates_token_count", 0) or 0,
    )


async def _claude(prompt: str, system: str) -> CallResult:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    msg = await client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return CallResult(
        text=msg.content[0].text,
        prompt_tokens=msg.usage.input_tokens,
        completion_tokens=msg.usage.output_tokens,
    )
