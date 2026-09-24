# Troubleshooting: Antigravity 403 "Verify your account to continue." (`VALIDATION_REQUIRED`)

**วันที่พบ:** 2026-09-24 · **บัญชี:** บัญชี Google AI Pro (`g1-pro-tier`) · **ผลลัพธ์สุดท้าย:** แก้ได้แล้ว

## อาการ

ทุก inference call ผ่าน `pi-antigravity` ล้มเหลว:

```
Antigravity API error (403, endpoint=https://cloudcode-pa.googleapis.com,
project=aicode-consumers, runtimeModel=gemini-3.8-flash-high, ...):
Antigravity denied this request. Next: re-login or try another model.
Backend said: Verify your account to continue.
```

- เกิดกับ**ทุกโมเดล** (`gemini-3.8-flash-high`, `claude-sonnet-4-6`, …) → ปัญหาระดับบัญชี ไม่ใช่รายโมเดล
- `/antigravity.usage` และ bottom bar ก็ล้มเหลวด้วย (`retrieveUserQuotaSummary failed: Verify your account to continue.`)

## สิ่งที่*ไม่*ใช่สาเหตุ (ตรวจแล้วปกติ)

| จุดที่ตรวจ | ผล |
|---|---|
| OAuth access/refresh token | ปกติ — refresh ได้, `verified_email: true` |
| Model catalog | โหลดได้ 31 โมเดลจาก `availableModels` |
| Subscription | Google ยืนยันเองว่ามี `paidTier: {"id":"g1-pro-tier","name":"Google AI Pro"}` |
| โค้ด/โมเดล/endpoint | ถูกต้อง — หลังแก้ใช้โค้ดชุดเดิมทำงานได้ทันที |

## สาเหตุที่แท้จริง (2 ชั้นซ้อน)

1. **บัญชีติด `VALIDATION_REQUIRED`** — Google บังคับยืนยันตัวตนระดับบัญชี (คนละเรื่องกับการมี subscription) เห็นได้จาก response ดิบของ `loadCodeAssist`:
   ```json
   "ineligibleTiers": [{ "reasonCode": "VALIDATION_REQUIRED",
     "reasonMessage": "Your current account is not ...", ... }]
   ```
   และ error ของ generate จะแนบ `google.rpc.Help` มาให้:
   ```json
   "reason": "VALIDATION_REQUIRED",
   "metadata": {
     "validation_url": "https://accounts.google.com/signin/continue?...continue=https://developers.google.com/gemini-code-assist/auth/auth_success_gemini&flowName=GlifWebSignIn&...",
     "validation_learn_more_url": "https://support.google.com/accounts?p=al_alert"
   }
   ```
   **จุดสำคัญ:** ข้อความ error ปกติ (`jsonOrTextError` ดึงแค่ `error.message`) จะ**ตัด URL นี้ทิ้ง** — ต้องอ่าน body ดิบจึงเห็นว่า Google แนบลิงก์แก้ปัญหามาให้ด้วย

2. **token/grant ที่ออกก่อน verify ฝังสถานะเก่า** — ต่อให้ verify แล้ว หรือแม้แต่ `refreshAntigravityToken` (ลองแล้ว) ก็ยัง 403 เหมือนเดิม ต้อง **login ใหม่ทั้งวงจร (OAuth consent ใหม่)** สถานะจิงหลุด

## วิธีแก้ที่ใช้ได้จริง (เรียงตามขั้นตอน)

1. **ยืนยันบัญชี** — เปิด `validation_url` จาก response ดิบในเบราว์เซอร์ (หน้า `accounts.google.com/signin/continue … flowName=GlifWebSignIn`) ทำตามจนจบที่หน้า `auth_success_gemini`
   - ถ้า Chrome ล็อกอินหลายบัญชี ให้แน่ว่าเป็นบัญชีที่ใช้กับ pi (เช็กก่อนด้วย `oauth2/v1/userinfo`)
   - เช็ก `myaccount.google.com/notifications` ว่ามี account alert ค้างหรือไม่
2. **login ใหม่ทั้งวงจร** — `/login antigravity` ใน pi หรือรัน `loginAntigravity()` + `rememberAccount()` จากแพ็กเกจเอง (ดู `scripts/diagnose-antigravity.mjs` ประกอบ)
3. **ทดสอบ** — ยิง prompt สั้น ๆ (`pi --no-session --model antigravity/gemini-3.8-flash-high -p "reply with exactly: OK"`) แล้วตรวจ quota ว่า `quotaSummaryError` เป็น `none`

## เครื่องมือที่ใช้ระหว่าง debug

- `scripts/diagnose-antigravity.mjs` — ยิง `loadCodeAssist` + generate แบบ raw แล้ว print tier/quota/error body เต็ม (รวม `validation_url`)
- หมายเหตุ: `loadCodeAssist` จะตอบ**ต่างกันตาม User-Agent** (มีเคสที่ตอบ `UNSUPPORTED_CLIENT` เมื่อใช้ UA แปลกปลอม) — ให้ใช้ `antigravityHeaders()` ของแพ็กเกจเสมอ

## Checklist เร็วเมื่อเจอ 403 อีก

- [ ] อ่าน error body ดิบ → มี `reason` อะไร (`VALIDATION_REQUIRED` / `PERMISSION_DENIED` / อย่างอื่น)
- [ ] `loadCodeAssist` → `currentTier` / `paidTier` / `ineligibleTiers` บอกอะไร
- [ ] token ยังไม่หมดอายุ? ลอง refresh ก่อน (แต่ถ้าเป็นสถานะบัญชี ต้อง re-login)
- [ ] ลองอีกโมเดล → ถ้าล้มเหมือนกันทั้งหมด = ระดับบัญชี
- [ ] ถ้า Google แนบ `validation_url` → ทำตามนั้น แล้ว **re-login** เสมอ
