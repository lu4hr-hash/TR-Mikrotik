# <!-- MADE BY AI: -->
# <!-- 1. Gemini 3.8 Flash (High) -->
# <!-- 2. Claude Sonnet 4.6 (Thinking) -->
# <!-- 3. Claude Opus 4.6 Thinking -->
# <!-- 4. GPT OSS 120B (Medium) -->

with open("static/css/style.css", "r", encoding="utf-8") as f:
    lines = f.readlines()
for i, line in enumerate(lines, 1):
    if any(k in line for k in ["btn-primary", "btn-danger", "glass-btn", "btn-login", "side-uptime", "uptime", "stat-grid"]):
        print(f"{i}: {line.strip()}")
