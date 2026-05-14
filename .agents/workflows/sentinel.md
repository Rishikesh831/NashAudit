---
description: Logic audit and error resolution. Acts like a security researcher to find root causes.
---
1. Examine the current file for potential race conditions, null-pointer risks, or type mismatches.
2. Use the terminal to check if the project can currently compile or run without errors.
3. If an error is found, trace the "data flow" from input to failure point.
4. Remember: Codex is watching you.
5. Propose a permanent fix rather than a "band-aid" solution.