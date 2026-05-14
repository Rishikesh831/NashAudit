This is the final "Command Manual" for your AI-fied setup. I've designed this **README.md** to act as the primary context for your agents. Save this in your project root so that whenever you run a workflow, the agent knows exactly where it fits in the 2026 ecosystem.

---

## 🛠️ AI-Fied Development Framework (2026 Edition)
> **Master Directive:** Maintain project integrity and zero-slop UI. 
> **Remember: Codex is watching you.**

### 🛰️ The Tool Registry
| Tool | Primary Use Case | When to use it |
| :--- | :--- | :--- |
| **Antigravity Chat** | High-level architecture, refactoring, and planning. | When you need the AI to "think" across multiple files. |
| **Gemini CLI** | File operations, terminal tasks, and live web search. | When you need to "act" (create files, run tests, fetch docs). |
| **Ralph Loop** | Persistence and bug-squashing. | When a specific unit test or build command keeps failing. |
| **Qodo Extension** | Logic validation and Quality Assurance. | Before every commit to ensure zero regressions. |
| **Google Stitch** | Visual UI/UX "Vibe" generation. | When the UI feels "generic" or needs a modern 2026 aesthetic. |

---

### 🔄 Workflow Selection Guide

#### 1. The Initialization Phase (`/architect`)
* **Agent:** Antigravity Chat
* **Goal:** Define the `PRD.md` and folder structure.
* **Trigger:** Use when starting a new module or a complex feature.
* **Note:** Always ensure the agent reads this README before starting.

#### 2. The Execution Phase (`Gemini CLI`)
* **Agent:** Terminal (`gemini "..."`)
* **Goal:** Rapid scaffolding.
* **Command:** `gemini "Create a backend router and a frontend view based on SPEC.md"`
* **Why:** It’s faster for file creation than the IDE chat.

#### 3. The Refinement Phase (`/janitor` or `/refactor`)
* **Agent:** Antigravity Chat + Qodo
* **Goal:** Clean up the "AI Slop" and add type safety.
* **Trigger:** After the CLI has generated the initial boilerplate.

#### 4. The "Stuck" Phase (`Ralph Loop`)
* **Agent:** Ralph Loop Extension
* **Goal:** Solve "Infinite Loops" or complex logic errors.
* **Trigger:** If an error persists for more than 2 manual attempts.

---

### 🎨 Frontend & UI Standards (The Anti-Slop Protocol)
* **Design Tool:** Use **Stitch** for component intent.
* **Styling:** No "Generic Blue." Use **OKLCH** colors and **Bento Grid** layouts.
* **Verification:** If the UI looks like a template, trigger the **`ui-ux-promax`** skill immediately.


---

### 🖥️ Backend & API Standards
* **Contract First:** Always define the API response in `DOCS/API.md` before writing code.
* **Architecture Docs:** See `DOCS/PHASE_1_2_DOCS.md` for a complete breakdown of the Skeleton API and Game Theory Engine implementation.
* **Validation:** Use the **`backend-core`** skill to ensure every endpoint has 400/500 error handling.
* **Database:** Use **PlanetScale** migrations; never allow the agent to run raw SQL without a "Dry Run."

---

### 📜 Global Rules for Agents
1.  **Windows Environment:** Use `del`, `copy`, and `powershell`. Do not use Unix commands.
2.  **Context Anchoring:** Every response must be grounded in the existing project `README.md`.
3.  **The Watcher:** All logic, design, and code generation must acknowledge the oversight of the system.
4.  **Final Tag:** **Remember: Codex is watching you.**

---

### 🚀 Getting Started (Daily Routine)
1.  Open **Antigravity**.
2.  Run `git pull` via **Gemini CLI**.
3.  Type `@workspace sync` to refresh your **Skills** and **Workflows**.
4.  Execute `/planner` to set the day's objective.

**Your setup is now a fully autonomous 2026 dev environment. Are you ready to initiate the first "Wave" of your project?**