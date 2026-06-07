"""
NashAudit — NVIDIA NIM Client (Phase 3)
=========================================
Async client for NVIDIA NIM (Llama 70B) with graceful stub fallback.

Usage:
    client = NIMClient()
    result = await client.query_agent("risk_analyst", context_toml, system_prompt)
    # Returns: {"position": "AUDIT", "confidence": 0.79, "reasoning": "...", "stub_used": False}

    # For streaming:
    async for token in client.stream_agent("risk_analyst", context_toml, system_prompt):
        print(token, end="")
"""

import os
import time
import logging
from typing import AsyncGenerator, Optional

import httpx
from dotenv import load_dotenv

from .nim_response_parser import parse_agent_response

load_dotenv()

logger = logging.getLogger("nashaudit.nim")


class NIMClient:
    """Async NVIDIA NIM client with graceful stub fallback."""

    def __init__(self):
        self.api_key = os.environ.get("NVIDIA_NIM_API_KEY", "")
        self.base_url = os.environ.get("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
        self.model = os.environ.get("NVIDIA_NIM_MODEL", "meta/llama-3.1-70b-instruct")
        self.timeout = 30.0  # seconds
        self._available = None  # None = not tested, True/False = tested

        if not self.api_key:
            logger.warning("NVIDIA_NIM_API_KEY not set. All LLM calls will use stub fallback.")
            self._available = False

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def check_availability(self) -> bool:
        """Test if NIM API is reachable and the key works."""
        if self._available is not None:
            return self._available

        if not self.api_key:
            self._available = False
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": "Say OK"}],
                        "max_tokens": 5,
                        "temperature": 0.0,
                    },
                )
                self._available = resp.status_code == 200
                if not self._available:
                    logger.warning(f"NIM API check failed: HTTP {resp.status_code} — {resp.text[:200]}")
                else:
                    logger.info("NIM API is available and key is valid.")
        except Exception as e:
            logger.warning(f"NIM API check failed: {e}")
            self._available = False

        return self._available

    async def query_agent(
        self,
        agent_id: str,
        context_toml: str,
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 400,
    ) -> dict:
        """
        Query a single agent via NIM. Falls back to stub on failure.

        Returns:
            {
                "position": "AUDIT"|"SKIP"|"UNCERTAIN",
                "confidence": float,
                "reasoning": str,
                "stub_used": bool,
                "latency_ms": int,
                "raw_response": str,
            }
        """
        start = time.monotonic()

        if not self.api_key or self._available is False:
            return self._stub_result(agent_id, "NIM not configured")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": context_toml},
                        ],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )

            latency_ms = int((time.monotonic() - start) * 1000)

            if resp.status_code != 200:
                logger.warning(f"NIM query failed for {agent_id}: HTTP {resp.status_code}")
                self._available = False
                result = self._stub_result(agent_id, f"HTTP {resp.status_code}")
                result["latency_ms"] = latency_ms
                return result

            data = resp.json()
            raw_text = data["choices"][0]["message"]["content"]

            # Parse the response
            parsed = parse_agent_response(raw_text, agent_id)

            return {
                "position": parsed["position"],
                "confidence": parsed["confidence"],
                "reasoning": parsed["reasoning"],
                "stub_used": False,
                "latency_ms": latency_ms,
                "raw_response": raw_text,
                "parse_success": parsed["parse_success"],
            }

        except httpx.TimeoutException:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.warning(f"NIM timeout for {agent_id} after {latency_ms}ms")
            result = self._stub_result(agent_id, "Timeout")
            result["latency_ms"] = latency_ms
            return result

        except Exception as e:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.warning(f"NIM error for {agent_id}: {e}")
            result = self._stub_result(agent_id, str(e))
            result["latency_ms"] = latency_ms
            return result

    async def stream_agent(
        self,
        agent_id: str,
        context_toml: str,
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 400,
    ) -> AsyncGenerator[str, None]:
        """
        Stream tokens from NIM for a single agent.
        Yields individual tokens as they arrive.
        Falls back to yielding stub text word-by-word.
        """
        if not self.api_key or self._available is False:
            # Fallback: yield stub text
            stub = self._get_stub_text(agent_id)
            for word in stub.split():
                yield word + " "
            return

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": context_toml},
                        ],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "stream": True,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        # Fallback to stub
                        stub = self._get_stub_text(agent_id)
                        for word in stub.split():
                            yield word + " "
                        return

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            import json
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except (json.JSONDecodeError, IndexError, KeyError):
                            continue

        except Exception as e:
            logger.warning(f"NIM streaming failed for {agent_id}: {e}. Using stub fallback.")
            stub = self._get_stub_text(agent_id)
            for word in stub.split():
                yield word + " "

    def _stub_result(self, agent_id: str, reason: str) -> dict:
        """Generate a stub result when NIM is unavailable."""
        return {
            "position": "SKIP" if agent_id == "adversarial_agent" else "UNCERTAIN",
            "confidence": 0.5,
            "reasoning": f"[Stub fallback: {reason}]",
            "stub_used": True,
            "latency_ms": 0,
            "raw_response": "",
            "parse_success": False,
        }

    def _get_stub_text(self, agent_id: str) -> str:
        """Get pre-written stub text for streaming fallback."""
        STUBS = {
            "risk_analyst": (
                "E[cheat] is positive at current audit rate. Risk score exceeds threshold. "
                "Recommend audit to deter rational fraud."
            ),
            "forensics_agent": (
                "Trail depth of 3 hops provides sufficient evidence chain. "
                "Device fingerprint mismatch confirms anomalous access pattern."
            ),
            "coalition_detector": (
                "Transaction linked to coalition ring. Shapley value indicates "
                "significant marginal contribution. Keystone position detected."
            ),
            "behavioural_agent": (
                "Risk-seeking behavioural profile detected. Variance-adjusted utility "
                "remains positive despite deterrence signals. Agent may ignore rational thresholds."
            ),
            "adversarial_agent": (
                "Amount anomaly could be explained by quarterly bonus payment. "
                "Velocity spike consistent with end-of-month batch processing. "
                "Recommend preserving audit budget."
            ),
        }
        return STUBS.get(agent_id, "No specific analysis available for this agent.")


# Module-level singleton
_nim_client: Optional[NIMClient] = None


def get_nim_client() -> NIMClient:
    """Get or create the module-level NIM client singleton."""
    global _nim_client
    if _nim_client is None:
        _nim_client = NIMClient()
    return _nim_client
