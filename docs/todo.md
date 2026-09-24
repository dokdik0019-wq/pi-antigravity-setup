# งานค้าง / แผนถัดไป

## 1. ระบบ fallback (ลำดับแรก — เหตุการณ์ 403 วันที่ 2026-09-24 คือ use case จริง)

เป้าหมาย: อย่าให้ผู้ใช้ต้องมานั่ง debug เองเมื่อ provider/โมเดลล้ม

- [ ] **Model/provider router**: เมื่อเจอ 403/402/429/timeout → สลับอัตโนมัติ
  - Antigravity โดน 429 (quota หมด) → `pi-antigravity` สลับบัญชีให้แล้ว; ถ้าหมดทุกบัญชี → ข้ามไป hyper
  - hyper 402 (เครดิตหมด) → แจ้งเตือนชัด ๆ + ข้ามกลับ Antigravity โมเดลอื่น
  - 403 `VALIDATION_REQUIRED` → แจ้งพร้อมลิงก์ `validation_url` จาก body ดิบ (อย่าปล่อยให้ error message ตัดทิ้ง)
- [ ] **ลำดับ fallback ตามประสิทธิภาพ**: เรียงโมเดลจากผล benchmark (ข้อ 2) — เร็ว/ถูกก่อน, คุณภาพสูงเมื่อจำเป็น
- [ ] **ผูกกับ bottom bar**: โชว์สถานะ "กำลัง fallback: X → Y" บนบรรทัดเดียวกับ usage bar
- [ ] จุดต่อที่เป็นไปได้: extension ที่ฟัง event `message_end`/error + `pi.model` / `setModel()` (session control) หรือทำเป็น `custom-provider` wrapper ที่ห่อ provider หลายตัวเป็น virtual provider เดียว

## 2. ทดสอบประสิทธิภาพ (ต่อจาก fallback ได้ทันที)

- [ ] Benchmark โมเดล Antigravity 31 ตัว + hyper (deepseek/glm/qwen): tok/s, TTFT, latency เฉลี่ย
- [ ] Benchmark เครื่องมือจาก repo pi-config (web-search/web-fetch/browser) ถ้าจะติดตั้งใช้
- [ ] นำผลไปจัดอันดับใน fallback order (ข้อ 1) และ/หรือโชว์ใน bottom bar
- [ ] ใช้ `extensions/tok-per-sec.ts` เป็นเซนเซอร์วัดพื้นฐาน (เก็บ `samples` ต่อโมเดล — ตอนนี้เก็บใน memory อย่างเดียว อาจเพิ่มการ persist ลงไฟล์)

## 3. ปรับปรุงเล็ก ๆ น้อย ๆ

- [ ] antigravity-usage-bar: persist ประวัติ usage เผื่อวาด trend (เช่น consumption ต่อชั่วโมง)
- [ ] tok-per-sec: เก็บค่าเฉลี่ย/peak ต่อโมเดล + คำสั่ง `/toks stats`
- [ ] teach skill: ปรับสรรพนาม/น้ำเสียงตามผู้เรียนจริง
