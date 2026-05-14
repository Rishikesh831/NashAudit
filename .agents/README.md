# Global AI Scripts - Agents Configuration

This repository contains custom Workflows and Skills designed to enforce strict structural, visual, and logic requirements—preventing generic "AI Slop" and ensuring Codex-level supervision.

---

## 🛠️ Workflows
*Workflows are step-by-step procedures triggered manually (often via slash commands) to guide the AI through well-defined execution paths.*

### 1. API Checker (`/api-checker`)
**Description:** Validates API consistency against existing project documentation. It actively scans for shadow APIs—endpoints existing in code but undocumented—and ensures naming conventions, status codes, and error-handling match the project's global standards.
**When to Use:** Trigger this before finalizing any backend changes to ensure your new or modified routes perfectly match standard API documentation contracts instead of drifting.

### 2. Architect (`/architect`)
**Description:** A universal planning and structuring agent that forces the AI into a "think-before-you-act" routine. It analyzes the local setup to learn existing conventions, prepares a structural outline, and holds execution until receiving your absolute approval.
**When to Use:** Use this whenever starting a brand new module, script, or block of logic to ensure a robust, overarching plan is established before any code gets frantically written.

### 3. Doc (`/doc`)
**Description:** Automates the tedious task of documenting code with Codex-level precision. It systematically reads your code to extract the purpose of every method, updating docstrings (like JSDoc) and maintaining the overarching README synchronously.
**When to Use:** Trigger this workflow right before committing new features to automatically update all project docs and ensure your codebase remains deeply understandable for the next developer.

### 4. Planner (`/planner`)
**Description:** Generates a highly technical execution plan grounded entirely in the master `README.md`. It actively looks for conflicts between your requested feature and the existing architectural blueprint, waiting for user "Go" before implementing a single line.
**When to Use:** Utilize this for complex multi-step features where you need a formal implementation plan artifact before executing changes that might disrupt existing structures.

### 5. Refactor (`/refactor`)
**Description:** Scans highlighted code to clean up loops, dead logic, and complex nesting, focusing heavily on Speed, Simplicity, and Standards. It rewrites logic to be idiomatic while outputting a before-and-after diff so you can verify the reduction in complexity.
**When to Use:** Trigger when you have messy, inefficient, or deeply nested logic blocks that desperately need optimization without changing their fundamental programmatic output.

### 6. Sentinel (`/sentinel`)
**Description:** Acts as a proactive security researcher and logic auditor. Instead of slapping band-aids on problems, it traces data flow from inputs to failure points, checking for null-pointers and race conditions to find a permanent root-cause fix.
**When to Use:** Deploy this when encountering a stubborn bug, a crashing function, or a vague error where you need a deep dive to fix the core root-cause rather than treating the symptom.

---

## 🧠 Skills
*Skills are passive background watchdogs that automatically trigger when the AI detects it is working on a specific related task.*

### 1. Backend Core
**Description:** Automatically enforces standard conventions for server-side logic, preventing raw table creations in favor of programmatic migrations. It also silently wraps routes in standardized error handlers (400, 404, 500) ensuring that all backend code is instantly bulletproof.
**When to Use:** Passively activates whenever the AI touches endpoints, database schemas, or API logic to guarantee a formal strict "contract" in your backend architecture.

### 2. Consistency Manager
**Description:** Acts as the codebase librarian, analyzing the styles, naming conventions, and tech stack in your existing overarching files. It forces the AI's generated output to flawlessly mimic how the rest of your current project is traditionally written.
**When to Use:** Passively activates on any code generation task so you have zero structural mismatch, guaranteeing the AI actually writes code that looks like *you* wrote it.

### 3. Design Critic
**Description:** Intercepts frontend generation to aggressively reject standard generic styles and outdated layouts (e.g., Bootstrap presets). It actively enforces CSS Grid, container queries, and OKLCH color palettes, strictly rejecting output that looks like a basic SaaS template.
**When to Use:** Passively activates whenever the AI generates HTML or CSS to act as the ultimate judge, making sure your layouts consistently look high-end and uniquely branded.

### 4. Frontend Pro
**Description:** Acts as the foundational UI/UX guardrail, ensuring you always rely on accessible contrast ratios and mobile-first logic. It actively checks your master README for a defined design system or theme constraint before rendering any buttons, inputs, or overarching layouts.
**When to Use:** Passively activates when requested to design user interfaces, completely preventing the model from randomly guessing colors and rigidly enforcing WCAG accessibility guidelines.

### 5. Loop Breaker
**Description:** A critical safety constraint designed to preserve token bandwidth by stopping sudden "infinite thinking" spirals. If the AI applies a fix that fails twice in a row, it hard-stops and strictly requests human intervention instead of repeatedly guessing fixes.
**When to Use:** Passively activates instantly if the AI hits a persistent roadblock on a single issue, alerting you visually instead of silently burning through API limits or failing quietly.

### 6. QA Sentry
**Description:** The ultimate tester watchdog that ensures no newly written code is formally accepted completely without tests. It autonomously suggests unit test setups for any newly generated functions over ten lines long using your preferred framework outlined in the docs.
**When to Use:** Passively activates right before code merges, pushes, or deploy actions to guarantee comprehensive test coverage exists and nothing slips into production untested.

### 7. Ralph Loop
**Description:** Enforces rigid execution protocol rules specifically for your custom iterative workflow paradigm. It dictates that the AI must read `progress.txt` before changes, caps failed loop attempts rigidly, and explicitly requires a successful verification build or test.
**When to Use:** Passively operates continuously to bring extreme rigidity to coding loops, ensuring the agent strictly follows state checkpoints and physically verifies its logic before returning `DONE`.

### 8. UI/UX Promax
**Description:** The premium aesthetic elevation skill that outright bans the use of "developer standard" default blues and grays everywhere. It forces your designs into clean, minimal "Notion-like" aesthetics or sleek dark-mode "Linear" aesthetics enriched with lush OKLCH glows.
**When to Use:** Passively activates anytime you ask for a layout without a theme, providing breathtaking, top-tier aesthetic styles immediately without you ever having to endlessly micromanage the CSS styling.
