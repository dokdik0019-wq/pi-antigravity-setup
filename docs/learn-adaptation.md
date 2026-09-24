# การดัดแปลง repo `learn` (amosblomqvist/learn) ให้ใช้กับ pi 0.87

แหล่งที่มา: <https://github.com/amosblomqvist/learn> — ระบบติว/เรียนรู้ส่วนตัวของ Eero
(วิดีโอ "How I Use AI to Learn Things") โครงสร้างเดิมเป็น `.pi` config ทั้งโฟลเดอร์

## สิ่งที่ติดตั้ง

| ชิ้นต้นทาง | ติดตั้งไปที่ | หมายเหตุ |
|---|---|---|
| `skills/teach/` | `~/.pi/agent/skills/teach/` | ปรัชญาสอน 2 หลักการ + ขั้นตอน motivate → establish → connect → quiz-check |
| `skills/visualize/` | `~/.pi/agent/skills/visualize/` | แก้ไวยากรณ์เรียก subagent เป็น `subagent({ agent, task })` + เปลี่ยนที่อ้างอิง agent dir |
| `extensions/quiz.ts` | `~/.pi/agent/extensions/quiz.ts` | tool `quiz` — คำถามมีคะแนน ✓/✗ + เฉลย |
| `extensions/ask-user-question.ts` | `~/.pi/agent/extensions/ask-user-question.ts` | tool `ask_user_question` (ต้องใช้ตัวนี้ตามคำแนะนำผู้เขียน — popup จากหลาย implementation จะแย่ง UI lock) |
| `extensions/md-log.ts` | `~/.pi/agent/extensions/md-log.ts` | `/md-log <path>`, `/md-unlog` — mirror บทเรียนลง md สำหรับ Obsidian |
| `extensions/visual-tools/` | `~/.pi/agent/extensions/visual-tools/` | 6 tools: `write/edit/render_mermaid` + `write/edit/render_svg` |
| `agents/svg-maker.md`, `agents/mermaid-maker.md` | `~/.pi/agent/agents/` | แปลง frontmatter เป็นของ pi-subagents (ดูด้านล่าง) |

**ไม่ได้ติดตั้ง:** `agents/researcher.md` — pi-subagents มี builtin `researcher` อยู่แล้ว
(ตัว builtin เจนกว่า: มี web_search/source_check) การติดตั้งซ้ำชื่อเดียวกันจะไปทับตัว builtin

## การดัดแปลงที่ทำ

### 1. Namespace ของโมดูล (ทั้งโฟลเดอร์)

```
@mariozechner/pi-coding-agent  →  @earendil-works/pi-coding-agent
@mariozechner/pi-tui           →  @earendil-works/pi-tui
@sinclair/typebox              →  typebox
```

> หมายเหตุ: pi 0.87 มี legacy alias ให้ `@mariozechner/*` และ `@sinclair/typebox` อยู่แล้ว
> (ดู `getAliases()` ใน `dist/core/extensions/loader.js`) — การเปลี่ยนเป็นความสะอาด ไม่บังคับ

### 2. `visual-tools/index.ts` — เพิ่ม fallback การ register

เดิม register เครื่องมือผ่าน hook `globalThis.__pi_interactive_subagents` ของ
`pi-interactive-subagents` เท่านั้น (ถ้าไม่มี = no-op เงียบ → เครื่องมือหายหมด)
ปรับเป็น:

1. ถ้ามี hook ของ interactive-subagents → ใช้ทางเดิม
2. ถ้าไม่มี → **register ตรงใน session นั้นเลย** (`mermaidToolsExtension(pi)` + `svgToolsExtension(pi)`)

### 3. Frontmatter ของ agents (interactive-subagents → pi-subagents)

| เดิม | ใหม่ | เหตุผล |
|---|---|---|
| `tools: write_svg, edit_svg, render_svg, read` | `tools: read, write_svg, edit_svg, render_svg` | เรียง builtin นำหน้า (cosmetic) |
| `model: anthropic/claude-sonnet-5` | (ลบ) | โมเดลนั้นไม่มีในเครื่องนี้ — ให้ inherit โมเดลปัจจุบันแทน |
| `system-prompt: append` | `systemPromptMode: append` | ชื่อฟิลด์ของ pi-subagents |
| `auto-exit: true` | (ลบ) | pi-subagents จบงานอัตโนมัติอยู่แล้ว |
| (ไม่มี) | `subagentOnlyExtensions: ~/.pi/agent/extensions/visual-tools/tools/svg_tools.ts` | **สำคัญ**: pi-subagents ไม่โหลดเครื่องมือจาก allowlist ให้เอง — ต้องชี้ไฟล์ extension ที่ register เครื่องมือ (ตาม docs "An allowlisted name does not load the extension that registers it") |

### 4. `skills/visualize/SKILL.md`

- `subagent(agent="svg-maker", task="...")` → `subagent({ agent: "svg-maker", task: "..." })` (object syntax ของ pi-subagents)
- "discovered from `.pi/agents/`" → "user agents in `~/.pi/agent/agents/`"

## Dependency ที่ติดตั้งเพิ่ม

- `~/.pi/agent/extensions/visual-tools/`: `npm install` (ติด `@mermaid-js/mermaid-cli`) แบบ
  `PUPPETEER_SKIP_DOWNLOAD=true` — ใช้ Chrome ที่ติดตั้งอยู่แล้วตาม design ของผู้เขียน
- `rsvg-convert` (macports/homebrew) มีอยู่แล้วสำหรับ SVG → PNG; fallback ImageMagick (`magick`)

## ผลทดสอบ smoke (วัดเวลาได้จริง 2026-09-24)

| ท่อ | เวลา | ผล |
|---|---|---|
| `write_svg` → `render_svg` (rsvg-convert) | ~309 ms | ✅ PNG ลง `viz/` + คืนภาพ inline |
| `write_mermaid` → `render_mermaid` (mmdc+Chrome) | ~2.7 s | ✅ เหมือนกัน |
| quiz / ask-user-question / md-log | — | ✅ register tool/command ครบ |

## ข้อควรรู้

- skill `teach` เขียนด้วยสรรพนาม "he/him" สำหรับผู้เรียนคนเดียว (ผู้เขียนเตือนใน README ต้นทาง) — อยากปรับน้ำเสียงให้แก้ `skills/teach/SKILL.md`
- การ dispatch maker: `subagent({ agent: "svg-maker", task: "<brief สั้น ๆ 1 ความคิด>" })` — ผู้ใช้ต้องมี pi-subagents (ติดตั้งแล้วในเครื่องนี้)
