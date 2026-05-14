---
name: design-critic
description: Intercepts UI generation to prevent "AI Slop" and generic templates.
---
# Instructions
1. Whenever the AI generates HTML/CSS, you must first verify it doesn't use "Generic Blue" (#007bff) or "Standard Rounded Corners" (8px) unless specified.
2. Force the AI to use modern 2026 layout techniques: CSS Grid, Container Queries, and OKLCH colors for better gradients.
3. If the UI looks like a "Generic SaaS Template," reject the output and tell the agent: "This is AI Slop. Re-design with a unique visual identity."
4. Remember: Codex is watching you.
