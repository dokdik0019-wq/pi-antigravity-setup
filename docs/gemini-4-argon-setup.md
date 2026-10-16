# Gemini 4 Argon on Pi (Antigravity)

คู่มือการเปิดใช้งานโมเดล **Gemini 4 Argon** บน Pi ผ่านปลั๊กอิน `pi-antigravity` และการแก้ปัญหา User-Agent version gating ของ Google

---

## 1. ที่มาและปัญหา

Google ได้ปล่อยโมเดล Gemini 4 Argon ให้ใช้งานผ่าน Google Antigravity โดยแอปทางการอย่าง Antigravity CLI (`agy` เวอร์ชัน 1.3.6 ขึ้นไป) สามารถเรียกใช้งานโมเดลต่อไปนี้ได้ทันที

- `gemini-4-argon-low`
- `gemini-4-argon-medium`
- `gemini-4-argon-high`

แต่เมื่อใช้งานผ่าน `pi-antigravity` บน Pi กลับไม่พบโมเดลในรายการ (`/model` หรือ `pi --list-models antigravity`)

### สาเหตุที่แท้จริง

Google CloudCode (`https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`) มีการตรวจสอบ `User-Agent` ของไคลเอนต์
- หากส่ง User-Agent รุ่นเก่า เช่น `1.2.4` (cl 982146307) เซิร์ฟเวอร์จะคืนเฉพาะโมเดลรุ่นเก่า (สูงสุดคือ Gemini 3.8 Flash) และคัดกรองโมเดลตระกูล 4 ทิ้ง
- หากส่ง User-Agent รุ่น `1.3.6` (cl 999748552) เซิร์ฟเวอร์จะส่งโมเดล `gemini-4-argon-low`, `gemini-4-argon-medium`, และ `gemini-4-argon-high` กลับมาพร้อมรหัสภายใน `MODEL_PLACEHOLDER_M419`, `MODEL_PLACEHOLDER_M418`, `MODEL_PLACEHOLDER_M417`

ตัวปลั๊กอิน `pi-antigravity` เวอร์ชันปัจจุบันฝังค่า User-Agent 1.2.4 ไว้ในโค้ด ทำให้ Pi มองไม่เห็นโมเดลนี้

---

## 2. วิธีติดตั้งและปรับแก้

สามารถรันสคริปต์อัตโนมัติจากโฟลเดอร์นี้ได้ทันที

```bash
node scripts/patch-gemini-4-argon.mjs
```

หรือปรับแก้ด้วยตนเองตามขั้นตอนด้านล่าง

### ขั้นตอนที่ 1 ปรับ User-Agent ใน `client.ts`

เปิดไฟล์ `~/.pi/agent/npm/node_modules/pi-antigravity/src/client/client.ts`

ค้นหา:
```ts
const DEFAULT_USER_AGENT =
  "antigravity/cli/1.2.4 (aidev_client; os_type=linux; arch=amd64; cl=982146307; auth_method=consumer)";
```

แทนที่ด้วย:
```ts
const DEFAULT_USER_AGENT =
  "antigravity/cli/1.3.6 (aidev_client; os_type=darwin; arch=arm64; cl=999748552; auth_method=consumer)";
```

### ขั้นตอนที่ 2 เพิ่ม Routing และ Model Definitions ใน `models.ts`

เปิดไฟล์ `~/.pi/agent/npm/node_modules/pi-antigravity/src/models/models.ts`

1. ใน `ANTIGRAVITY_ROUTING` เพิ่ม:
```ts
  "gemini-4-argon": {
    off: "gemini-4-argon-low",
    routing: {
      minimal: "gemini-4-argon-low",
      low: "gemini-4-argon-low",
      medium: "gemini-4-argon-medium",
      high: "gemini-4-argon-high",
      xhigh: "gemini-4-argon-high",
    },
    defaultRequestId: "gemini-4-argon-low",
  },
```

2. ใน `ANTIGRAVITY_MODELS` เพิ่ม:
```ts
  {
    id: "gemini-4-argon",
    name: "Gemini 4 Argon (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: geminiProCost,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
```

3. ใน `ANTIGRAVITY_MODEL_ENUM` เพิ่ม:
```ts
  // Gemini 4 Argon
  "gemini-4-argon": "MODEL_PLACEHOLDER_M418",
  "gemini-4-argon-high": "MODEL_PLACEHOLDER_M417",
  "gemini-4-argon-medium": "MODEL_PLACEHOLDER_M418",
  "gemini-4-argon-low": "MODEL_PLACEHOLDER_M419",
```

### ขั้นตอนที่ 3 รีเซ็ตแคชโมเดล

รีเซ็ตค่า `checkedAt` ใน `~/.pi/agent/models-store.json` ให้เป็น `0` เพื่อบังคับให้ Pi ดึงแค็ตตาล็อกสดจาก Google ทันที

```bash
python3 -c "
import json
p = '/Users/dookdik/.pi/agent/models-store.json'
d = json.load(open(p))
if 'antigravity' in d and 'pi-antigravity' in d['antigravity']:
    d['antigravity']['pi-antigravity']['checkedAt'] = 0
json.dump(d, open(p, 'w'), indent=2)
"
pi update --models
```

---

## 3. การตรวจสอบ

ตรวจสอบรายชื่อโมเดล:
```bash
pi --list-models antigravity
```
จะปรากฏ `antigravity/gemini-4-argon` (1.0M context, 65.5K output, thinking yes, images yes)

ทดสอบเรียกใช้งาน:
```bash
pi --model "antigravity/gemini-4-argon" -p "Reply with the single word OK"
```

ทดสอบการคิด (Reasoning effort):
```bash
pi --model "antigravity/gemini-4-argon" --thinking high -p "Hello"
```
รองรับระดับความคิด: `low`, `medium`, `high`
