# pi-setup — ชุดปรับแต่ง Pi สำหรับ Antigravity / Google AI Pro

โฟลเดอร์งานนี้เก็บ source และเอกสารของทุกอย่างที่ติดตั้ง/เขียนขึ้นเพื่อใช้งาน
[Pi coding agent](https://github.com/earendil-works/pi) ร่วมกับ Antigravity (Google AI Pro)
ประกอบด้วย bottom bar แสดงโควตา, ตัววัด tok/s, ระบบติว `learn` ที่ดัดแปลงแล้ว,
และเอกสารวินิจฉัยปัญหา 403 `VALIDATION_REQUIRED` ที่ใช้แก้จนระบบกลับมาใช้ได้

## สิ่งที่อยู่ในโฟลเดอร์นี้

| พาธ | คำอธิบาย | ติดตั้งไปที่ |
|---|---|---|
| `extensions/antigravity-usage-bar.ts` | Bottom bar ใต้ editor แสดงโควตา Antigravity ทุก pool (Gemini / Claude+GPT × 5h / weekly) + เวลา reset | `~/.pi/agent/extensions/antigravity-usage-bar.ts` |
| `extensions/tok-per-sec.ts` | แสดง tok/s บนบรรทัด working (แถว spinner เหนือช่องพิมพ์) แบบสด + ค่าจริงตอนจบคำตอบ | `~/.pi/agent/extensions/tok-per-sec.ts` |
| `agents/svg-maker.md` | Subagent วาดภาพ SVG → PNG (rsvg-convert, fallback ImageMagick) | `~/.pi/agent/agents/svg-maker.md` |
| `agents/mermaid-maker.md` | Subagent วาดแผนภาพ Mermaid → PNG (mermaid-cli + Chrome) | `~/.pi/agent/agents/mermaid-maker.md` |
| `scripts/diagnose-antigravity.mjs` | วินิจฉัยสถานะบัญชี Antigravity (tier/quota/403) แบบ raw — ใช้ตอน debug ปัญหา VALIDATION_REQUIRED | รันตรง ๆ ได้เลย |
| `docs/troubleshooting-antigravity-403.md` | เคสไฟล์ปัญหา 403 `Verify your account to continue.` + วิธีแก้ที่ใช้ได้จริง | — |
| `docs/learn-adaptation.md` | แผนที่การดัดแปลง repo `learn` (amosblomqvist/learn) ให้ใช้กับ pi 0.87 | — |
| `docs/todo.md` | งานค้าง: benchmark ประสิทธิภาพ + ระบบ fallback | — |

## ติดตั้ง / deploy

ไฟล์ต้นฉบับในโฟลเดอร์นี้คือ source of truth — คัดลอกทับไฟล์ปลายทางเมื่อแก้ไข:

```bash
cp extensions/antigravity-usage-bar.ts ~/.pi/agent/extensions/
cp extensions/tok-per-sec.ts ~/.pi/agent/extensions/
cp agents/*.md ~/.pi/agent/agents/
# จากนั้น /reload ใน pi หรือเปิด pi ใหม่
```

> ไฟล์ที่ deploy แล้วจะถูกโหลดโดย pi (jiti) ทันที — ไม่ต้อง build

## คำสั่งที่มี

| คำสั่ง | ผล |
|---|---|
| `/agbar` | เปิด/ปิด bottom bar โควตา |
| `/agbar refresh` | ดึงข้อมูลโควตาใหม่ทันที |
| `/toks` | เปิด/ปิดตัววัด tok/s (คืนข้อความ working เดิมอัตโนมัติ) |

## ภาพรวมสถาปัตยกรรม

- **antigravity-usage-bar**: เรียก `fetchAccountUsage` ของแพ็กเกจ `pi-antigravity` (ที่ติดตั้งเป็น pi package อยู่แล้ว) ผ่าน dynamic import จาก `~/.pi/agent/npm/node_modules/` — จึงรองรับ OAuth refresh / หลายบัญชีตามเดิม, refresh ทุก 2 นาที + เมื่อจบทุก turn
- **tok-per-sec**: จับ `message_start` / `message_update` / `message_end` วัดความเร็ว generate จริง (first delta → end) และ ttft, แสดงผ่าน `ctx.ui.setWorkingMessage()`
- **agents ทั้งสอง**: เป็น agent definition ของ [pi-subagents](https://github.com/earendil-works/pi-subagents) (ค้นพบจาก `~/.pi/agent/agents/`) โหลดเครื่องมือเฉพาะตัวผ่าน `subagentOnlyExtensions` ชี้ไปที่ `visual-tools` ของ repo learn

## ที่มา

- ระบบติว/visualize ดัดแปลงจาก [amosblomqvist/learn](https://github.com/amosblomqvist/learn) (MIT)
- แรงบันดาลใจ extension จาก [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config)
- Provider: [pi-antigravity](https://github.com/Rahularya01/pi-antigravity) (ไม่เป็นทางการ, ไม่เกี่ยวข้องกับ Google)
