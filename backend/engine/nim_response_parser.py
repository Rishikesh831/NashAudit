"""
NashAudit — NVIDIA NIM Response Parser
========================================
Extracts structured position/confidence/reasoning from raw LLM output.
Handles malformed responses gracefully.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger("nashaudit.nim_parser")

# Valid positions
VALID_POSITIONS = {"AUDIT", "SKIP", "UNCERTAIN"}


def parse_agent_response(raw_text: str, agent_id: str = "") -> dict:
    """
    Parse a raw LLM response into structured format.

    Expected LLM output format:
        position: AUDIT | SKIP | UNCERTAIN
        confidence: [0.0 to 1.0]
        reasoning: [text]

    Returns:
        {"position": str, "confidence": float, "reasoning": str, "parse_success": bool}
    """
    if not raw_text or not raw_text.strip():
        logger.warning(f"Empty response from agent {agent_id}")
        return _default_response(agent_id, "Empty LLM response")

    text = raw_text.strip()

    # ── Extract position ──
    position = _extract_position(text)

    # ── Extract confidence ──
    confidence = _extract_confidence(text)

    # ── Extract reasoning ──
    reasoning = _extract_reasoning(text)

    # Validate
    if position is None:
        logger.warning(f"Could not parse position from agent {agent_id}: {text[:100]}")
        return _default_response(agent_id, f"Unparseable response: {text[:200]}")

    # Adversarial agent should never recommend AUDIT
    if agent_id == "adversarial_agent" and position == "AUDIT":
        position = "UNCERTAIN"

    return {
        "position": position,
        "confidence": confidence,
        "reasoning": reasoning or text[:500],
        "parse_success": True,
    }


def _extract_position(text: str) -> Optional[str]:
    """Extract position from various formats."""
    # Pattern 1: "position: AUDIT" or "Position: SKIP"
    match = re.search(r"position\s*[:=]\s*(AUDIT|SKIP|UNCERTAIN)", text, re.IGNORECASE)
    if match:
        return match.group(1).upper()

    # Pattern 2: "**AUDIT**" or "**Position:** AUDIT"
    match = re.search(r"\*\*(AUDIT|SKIP|UNCERTAIN)\*\*", text, re.IGNORECASE)
    if match:
        return match.group(1).upper()

    # Pattern 3: standalone "AUDIT" or "SKIP" on its own line
    for line in text.split("\n"):
        stripped = line.strip().rstrip(".")
        if stripped.upper() in VALID_POSITIONS:
            return stripped.upper()

    # Pattern 4: "I recommend AUDIT" or "My recommendation is SKIP"
    match = re.search(
        r"(?:recommend|recommendation|decision|verdict|conclude|position)\s*(?:is|:)?\s*(AUDIT|SKIP|UNCERTAIN)",
        text, re.IGNORECASE
    )
    if match:
        return match.group(1).upper()

    return None


def _extract_confidence(text: str) -> float:
    """Extract confidence value from text."""
    # Pattern 1: "confidence: 0.79"
    match = re.search(r"confidence\s*[:=]\s*(\d+\.?\d*)", text, re.IGNORECASE)
    if match:
        val = float(match.group(1))
        # Handle percentage format (79 → 0.79)
        if val > 1.0:
            val = val / 100.0
        return round(min(max(val, 0.0), 1.0), 3)

    # Pattern 2: "[0.79]" or "(0.79)"
    match = re.search(r"[\[\(](\d+\.?\d*)[\]\)]", text)
    if match:
        val = float(match.group(1))
        if 0.0 <= val <= 1.0:
            return round(val, 3)

    return 0.5  # default


def _extract_reasoning(text: str) -> Optional[str]:
    """Extract reasoning paragraph from text."""
    # Pattern 1: "reasoning: ..."
    match = re.search(r"reasoning\s*[:=]\s*(.+)", text, re.IGNORECASE | re.DOTALL)
    if match:
        reasoning = match.group(1).strip()
        # Stop at next field if present
        reasoning = re.split(r"\n\s*(?:position|confidence)\s*[:=]", reasoning, flags=re.IGNORECASE)[0]
        return reasoning.strip()[:1000]

    # Pattern 2: everything after position + confidence
    lines = text.split("\n")
    reasoning_lines = []
    past_headers = False
    for line in lines:
        if re.match(r"(position|confidence)\s*[:=]", line, re.IGNORECASE):
            past_headers = True
            continue
        if past_headers and line.strip():
            reasoning_lines.append(line.strip())

    if reasoning_lines:
        return " ".join(reasoning_lines)[:1000]

    return None


def _default_response(agent_id: str, error_msg: str) -> dict:
    """Return a safe default response when parsing fails."""
    # Adversarial agent defaults to SKIP, others to UNCERTAIN
    default_position = "SKIP" if agent_id == "adversarial_agent" else "UNCERTAIN"
    return {
        "position": default_position,
        "confidence": 0.5,
        "reasoning": f"[Parse error: {error_msg}]",
        "parse_success": False,
    }
