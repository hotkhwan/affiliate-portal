<script setup lang="ts">
import { captionText, missionProgress, parseFacts, uploadedShotNumbers, validateProduct } from './lib/mission-flow'
import { createMissionApi, MissionApiError } from './services/mission-api'
import type { Mission, ProductFacts } from './types/mission'

const config = useRuntimeConfig()
const api = createMissionApi(config.public.missionApiBase)
const mission = ref<Mission | null>(null)
const busy = ref('')
const message = ref('')
const error = ref('')
const copied = ref(false)
const factsText = ref('')
const platform = ref('tiktok')
const postUrl = ref('')
const product = reactive<ProductFacts>({ name: '', description: '', price: '', promotion: '', facts: [] })

const progress = computed(() => missionProgress(mission.value))
const uploadedShots = computed(() => uploadedShotNumbers(mission.value))
const allShotsUploaded = computed(() => uploadedShots.value.size === 3)
const currentStep = computed(() => {
  if (!mission.value) return 'product'
  if (!allShotsUploaded.value) return 'capture'
  if (!mission.value.draft) return 'draft'
  if (!mission.value.export) return 'export'
  return 'post'
})

function userId() {
  const key = 'kwanni-alpha-user'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = `alpha-${crypto.randomUUID()}`
  localStorage.setItem(key, id)
  return id
}

function setMission(next: Mission) {
  mission.value = next
  localStorage.setItem('kwanni-active-mission', next.id)
}

function describeError(cause: unknown) {
  if (cause instanceof MissionApiError) {
    return cause.status >= 500
      ? 'ระบบยังไม่พร้อมชั่วคราว ข้อมูลของคุณยังอยู่ ลองอีกครั้งได้เลย'
      : cause.message
  }
  return 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'
}

async function run(label: string, action: () => Promise<Mission>, success: string) {
  busy.value = label
  error.value = ''
  message.value = ''
  try {
    setMission(await action())
    message.value = success
  }
  catch (cause) {
    error.value = describeError(cause)
  }
  finally {
    busy.value = ''
  }
}

async function startMission() {
  const prepared = { ...product, facts: parseFacts(factsText.value) }
  const validation = validateProduct(prepared)
  if (validation) {
    error.value = validation
    return
  }
  await run('create', () => api.create(userId(), prepared), 'ภารกิจพร้อมแล้ว เริ่มถ่ายทีละช็อตได้เลย')
}

async function uploadShot(shot: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!mission.value || !file) return
  if (file.size > 8 * 1024 * 1024) {
    error.value = 'ไฟล์ใหญ่เกิน 8 MB กรุณาเลือกภาพหรือคลิปที่สั้นลง'
    input.value = ''
    return
  }
  await run(`shot-${shot}`, () => api.upload(mission.value!.id, shot, file), `บันทึกช็อต ${shot} แล้ว`)
  input.value = ''
}

async function generateDraft() {
  if (!mission.value) return
  await run('draft', () => api.generateDraft(mission.value!.id), 'โพสต์ฉบับร่างพร้อมแล้ว')
}

async function prepareExport() {
  if (!mission.value) return
  await run('export', () => api.exportDraft(mission.value!.id), 'เตรียมไฟล์แนวตั้งพร้อมสำหรับขั้นตอนโพสต์แล้ว')
}

async function copyCaption() {
  if (!mission.value?.draft) return
  try {
    await navigator.clipboard.writeText(captionText(mission.value))
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  }
  catch {
    error.value = 'คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกแทน'
  }
}

async function markPosted() {
  if (!mission.value) return
  await run('posted', () => api.markPosted(mission.value!.id, platform.value, postUrl.value), 'เยี่ยมเลย บันทึกโพสต์แรกแล้ว')
}

function resetMission() {
  mission.value = null
  product.name = ''
  product.description = ''
  product.price = ''
  product.promotion = ''
  factsText.value = ''
  message.value = ''
  error.value = ''
  localStorage.removeItem('kwanni-active-mission')
}

onMounted(async () => {
  const id = localStorage.getItem('kwanni-active-mission')
  if (!id) return
  busy.value = 'restore'
  try {
    mission.value = await api.get(id)
  }
  catch {
    localStorage.removeItem('kwanni-active-mission')
  }
  finally {
    busy.value = ''
  }
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="KWANNI หน้าแรก">
        <span class="brand-mark">K</span>
        <span>KWANNI</span>
      </a>
      <span class="alpha-badge">Alpha · ภารกิจแรก</span>
    </header>

    <main id="top">
      <section class="hero">
        <p class="eyebrow">เริ่ม Affiliate แบบทีละขั้น</p>
        <h1>ไม่รู้จะถ่ายยังไง?<br><span>เริ่มจากของที่คุณมี</span></h1>
        <p class="hero-copy">บอกเราเกี่ยวกับสินค้า แล้วทำตาม 3 ช็อตง่าย ๆ คุณจะได้โพสต์ฉบับแรกพร้อมนำไปลองตลาด</p>
        <div class="proof-row" aria-label="สิ่งที่ไม่จำเป็นต้องทำ">
          <span>✓ ไม่ต้องเขียน Prompt</span>
          <span>✓ ไม่ต้องตัดต่อเป็น</span>
          <span>✓ ไม่ต้องซื้อ Credit</span>
        </div>
      </section>

      <div class="workspace">
        <aside class="progress-card" aria-label="ความคืบหน้าภารกิจ">
          <div class="progress-heading">
            <span>ก้าวของคุณ</span>
            <strong>{{ progress.filter(item => item.complete).length }}/5</strong>
          </div>
          <ol>
            <li v-for="item in progress" :key="item.label" :class="{ complete: item.complete, current: item.current }">
              <span class="status-dot">{{ item.complete ? '✓' : '' }}</span>
              {{ item.label }}
            </li>
          </ol>
          <button v-if="mission?.state === 'posted'" class="text-button" type="button" @click="resetMission">
            เริ่มภารกิจถัดไป →
          </button>
        </aside>

        <section class="mission-card" aria-live="polite">
          <div v-if="busy === 'restore'" class="loading-state">
            <span class="spinner" /> กำลังเปิดภารกิจของคุณ…
          </div>

          <template v-else-if="currentStep === 'product'">
            <div class="section-number">01</div>
            <p class="section-label">เลือกสิ่งที่อยากลอง</p>
            <h2>วันนี้อยากเล่าเรื่องสินค้าอะไร?</h2>
            <p class="section-copy">เริ่มจากของที่มีอยู่แล้วหรือสินค้าที่ใช้จริง ไม่ต้องหาของใหม่</p>

            <form class="form-grid" @submit.prevent="startMission">
              <label class="wide">
                <span>ชื่อสินค้า <b>*</b></span>
                <input v-model="product.name" autocomplete="off" placeholder="เช่น กล่องจัดระเบียบของเล่น">
              </label>
              <label class="wide">
                <span>ใช้ทำอะไร <b>*</b></span>
                <textarea v-model="product.description" rows="3" placeholder="เช่น ช่วยแยกของเล่นให้หยิบง่ายและเก็บเร็วขึ้น" />
              </label>
              <label>
                <span>ราคา (ถ้ามี)</span>
                <input v-model="product.price" autocomplete="off" placeholder="เช่น 299 บาท">
              </label>
              <label>
                <span>โปรโมชันจริง (ถ้ามี)</span>
                <input v-model="product.promotion" autocomplete="off" placeholder="เช่น ส่งฟรีถึงวันอาทิตย์">
              </label>
              <label class="wide">
                <span>ข้อเท็จจริงที่อยากบอก (บรรทัดละข้อ)</span>
                <textarea v-model="factsText" rows="3" placeholder="เช่น มีล้อเลื่อน&#10;ฝาปิดถอดได้" />
              </label>
              <button class="primary wide" type="submit" :disabled="Boolean(busy)">
                <span v-if="busy === 'create'" class="spinner" />
                {{ busy === 'create' ? 'กำลังเตรียมภารกิจ' : 'เริ่มภารกิจแรก' }}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </template>

          <template v-else-if="currentStep === 'capture' && mission">
            <div class="section-number">02</div>
            <p class="section-label">ถ่ายตามไกด์</p>
            <h2>ถ่าย 3 ช็อตนี้ก็พอ</h2>
            <p class="section-copy">ไม่ต้องถ่ายให้เป๊ะ แสงธรรมชาติและภาพที่เห็นสินค้าจริงก็เพียงพอ</p>

            <div class="product-chip">
              <span>ภารกิจวันนี้</span>
              <strong>{{ mission.product.name }}</strong>
            </div>

            <ol class="shot-list">
              <li v-for="shot in mission.shots" :key="shot.number" :class="{ uploaded: uploadedShots.has(shot.number) }">
                <div class="shot-number">{{ uploadedShots.has(shot.number) ? '✓' : shot.number }}</div>
                <div>
                  <strong>Shot {{ shot.number }}</strong>
                  <p>{{ shot.instruction }}</p>
                </div>
                <label class="upload-button" :class="{ disabled: Boolean(busy) || uploadedShots.has(shot.number) }">
                  {{ busy === `shot-${shot.number}` ? 'กำลังบันทึก…' : uploadedShots.has(shot.number) ? 'บันทึกแล้ว' : 'เลือกภาพ/คลิป' }}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,video/mp4"
                    capture="environment"
                    :disabled="Boolean(busy) || uploadedShots.has(shot.number)"
                    @change="uploadShot(shot.number, $event)"
                  >
                </label>
              </li>
            </ol>
          </template>

          <template v-else-if="currentStep === 'draft' && mission">
            <div class="section-number">03</div>
            <p class="section-label">เตรียมโพสต์</p>
            <h2>ครบแล้ว พร้อมจัดเป็นโพสต์</h2>
            <p class="section-copy">KWANNI จะเรียง 3 ช็อตและเขียน Caption จากข้อมูลจริงที่คุณให้ไว้ หากระบบช่วยเขียนไม่พร้อม จะใช้ฉบับมาตรฐานแทนโดยงานไม่สะดุด</p>
            <div class="ready-shots">
              <span v-for="shot in mission.shots" :key="shot.number">✓ Shot {{ shot.number }}</span>
            </div>
            <button class="primary" type="button" :disabled="Boolean(busy)" @click="generateDraft">
              <span v-if="busy === 'draft'" class="spinner" />
              {{ busy === 'draft' ? 'กำลังเตรียมโพสต์' : 'สร้างโพสต์ฉบับร่าง' }}
              <span aria-hidden="true">→</span>
            </button>
          </template>

          <template v-else-if="currentStep === 'export' && mission?.draft">
            <div class="section-number">04</div>
            <p class="section-label">ตรวจโพสต์ฉบับร่าง</p>
            <h2>อ่านแล้วใช่แบบที่คุณอยากพูดไหม?</h2>
            <div class="caption-card">
              <p>{{ mission.draft.caption }}</p>
              <p>{{ mission.draft.cta }}</p>
              <p class="hashtags">{{ mission.draft.hashtags.join(' ') }}</p>
            </div>
            <div class="action-row">
              <button class="secondary" type="button" @click="copyCaption">
                {{ copied ? '✓ คัดลอกแล้ว' : 'คัดลอก Caption' }}
              </button>
              <button class="primary" type="button" :disabled="Boolean(busy)" @click="prepareExport">
                <span v-if="busy === 'export'" class="spinner" />
                {{ busy === 'export' ? 'กำลังเตรียม' : 'เตรียมไฟล์พร้อมโพสต์' }}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </template>

          <template v-else-if="currentStep === 'post' && mission">
            <div class="section-number">05</div>
            <p class="section-label">โพสต์และบันทึกผล</p>
            <h2 v-if="mission.state !== 'posted'">พร้อมลองตลาดแล้ว</h2>
            <h2 v-else>โพสต์แรกสำเร็จแล้ว 🎉</h2>

            <template v-if="mission.state !== 'posted'">
              <div class="export-ready">
                <span>✓</span>
                <div>
                  <strong>แผนไฟล์แนวตั้งพร้อมแล้ว</strong>
                  <p>{{ mission.export?.width }} × {{ mission.export?.height }} · MP4 · เก็บผ่าน SeaweedFS S3-compatible storage</p>
                </div>
              </div>
              <button class="secondary full" type="button" @click="copyCaption">
                {{ copied ? '✓ คัดลอกแล้ว' : 'คัดลอก Caption' }}
              </button>
              <div class="post-form">
                <label>
                  <span>โพสต์ที่ไหน</span>
                  <select v-model="platform">
                    <option value="tiktok">TikTok</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="shopee">Shopee</option>
                    <option value="lazada">Lazada</option>
                  </select>
                </label>
                <label>
                  <span>ลิงก์โพสต์ (ข้ามได้)</span>
                  <input v-model="postUrl" type="url" placeholder="https://…">
                </label>
              </div>
              <button class="primary full" type="button" :disabled="Boolean(busy)" @click="markPosted">
                <span v-if="busy === 'posted'" class="spinner" />
                {{ busy === 'posted' ? 'กำลังบันทึก' : 'บันทึกว่าโพสต์แล้ว' }}
                <span aria-hidden="true">→</span>
              </button>
            </template>

            <template v-else>
              <div class="success-panel">
                <span class="success-mark">✓</span>
                <strong>First Mission → First Post</strong>
                <p>ก้าวถัดไปคือกลับมาบันทึกผลที่เกิดขึ้นจริง แล้วลองภารกิจใหม่จากสิ่งที่ได้เรียนรู้</p>
              </div>
              <button class="primary full" type="button" @click="resetMission">เริ่มภารกิจถัดไป →</button>
            </template>
          </template>

          <p v-if="message" class="notice success" role="status">✓ {{ message }}</p>
          <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        </section>
      </div>

      <p class="safety-note">KWANNI ช่วยแนะนำและเตรียมคอนเทนต์ แต่ไม่รับประกันยอดขายหรือรายได้</p>
    </main>
  </div>
</template>

<style>
:root {
  color: #1d2a26;
  background: #f6f3ea;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
button, input, textarea, select { font: inherit; }
button, .upload-button { cursor: pointer; }
button:disabled { cursor: wait; opacity: .65; }

.shell { min-height: 100vh; background: radial-gradient(circle at 85% 10%, #dff1d8 0, transparent 28rem), #f6f3ea; }
.topbar { height: 74px; display: flex; align-items: center; justify-content: space-between; max-width: 1180px; margin: auto; padding: 0 26px; border-bottom: 1px solid rgba(29, 42, 38, .1); }
.brand { display: flex; align-items: center; gap: 10px; color: #173f32; text-decoration: none; font-weight: 700; letter-spacing: .06em; }
.brand-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px 11px 11px 3px; background: #1f6b4f; color: white; }
.alpha-badge { font-size: .75rem; font-weight: 600; color: #476159; border: 1px solid #c4d1c8; border-radius: 999px; padding: 6px 12px; background: rgba(255,255,255,.55); }
main { max-width: 1180px; margin: auto; padding: 58px 26px 30px; }
.hero { max-width: 730px; margin-bottom: 48px; }
.eyebrow, .section-label { color: #b15d38; font-weight: 700; font-size: .78rem; letter-spacing: .07em; text-transform: uppercase; margin: 0 0 12px; }
h1 { font-size: clamp(2.7rem, 6vw, 5.35rem); line-height: .98; letter-spacing: -.055em; margin: 0; color: #173f32; }
h1 span { color: #1f6b4f; }
.hero-copy { font-size: 1.08rem; line-height: 1.8; max-width: 620px; color: #53625d; margin: 26px 0 20px; }
.proof-row { display: flex; flex-wrap: wrap; gap: 10px 24px; color: #315146; font-size: .88rem; font-weight: 600; }
.workspace { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 24px; align-items: start; }
.progress-card, .mission-card { background: rgba(255, 255, 255, .9); border: 1px solid rgba(28, 72, 56, .12); box-shadow: 0 20px 60px rgba(44, 61, 51, .08); }
.progress-card { position: sticky; top: 20px; border-radius: 22px; padding: 22px; }
.progress-heading { display: flex; justify-content: space-between; align-items: center; font-size: .82rem; color: #69766f; margin-bottom: 20px; }
.progress-heading strong { color: #1f6b4f; }
.progress-card ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 17px; }
.progress-card li { position: relative; display: flex; gap: 11px; align-items: center; color: #8b948f; font-size: .84rem; }
.progress-card li.complete { color: #294b3e; }
.progress-card li.current { color: #173f32; font-weight: 700; }
.status-dot { display: grid; place-items: center; flex: 0 0 22px; height: 22px; border: 1.5px solid #c7cdc9; border-radius: 50%; color: white; font-size: .7rem; }
.complete .status-dot { border-color: #1f6b4f; background: #1f6b4f; }
.current .status-dot { border: 5px solid #cee4d6; background: #1f6b4f; }
.text-button { border: 0; color: #1f6b4f; background: transparent; padding: 18px 0 0; font-weight: 700; }
.mission-card { border-radius: 28px; padding: clamp(28px, 5vw, 60px); min-height: 500px; }
.section-number { float: right; color: #d8ded9; font-size: 2.5rem; font-weight: 700; line-height: 1; }
h2 { max-width: 650px; color: #173f32; font-size: clamp(1.8rem, 4vw, 3rem); line-height: 1.15; letter-spacing: -.035em; margin: 0 0 12px; }
.section-copy { color: #68736f; line-height: 1.7; margin: 0 0 30px; max-width: 650px; }
.form-grid, .post-form { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
label { display: grid; gap: 7px; }
label > span { font-size: .82rem; font-weight: 600; color: #53625d; }
label b { color: #b15d38; }
.wide, .full { grid-column: 1 / -1; }
input, textarea, select { width: 100%; border: 1px solid #d4dad5; border-radius: 12px; color: #1d2a26; background: #fbfcfa; padding: 13px 14px; outline: none; transition: border .15s, box-shadow .15s; }
textarea { resize: vertical; }
input:focus, textarea:focus, select:focus { border-color: #1f6b4f; box-shadow: 0 0 0 3px rgba(31, 107, 79, .12); }
.primary, .secondary { display: inline-flex; align-items: center; justify-content: center; gap: 12px; border-radius: 13px; min-height: 52px; padding: 13px 20px; font-weight: 700; }
.primary { border: 1px solid #1f6b4f; color: white; background: #1f6b4f; box-shadow: 0 9px 24px rgba(31, 107, 79, .18); }
.primary:hover:not(:disabled) { background: #17543e; transform: translateY(-1px); }
.secondary { border: 1px solid #cbd5ce; color: #1f6b4f; background: #f6faf7; }
.spinner { width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.product-chip { display: flex; align-items: center; gap: 13px; margin-bottom: 18px; padding: 13px 16px; background: #f3f7f3; border-radius: 13px; }
.product-chip span { color: #748079; font-size: .75rem; }
.product-chip strong { color: #204837; }
.shot-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.shot-list li { display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 15px; padding: 18px; border: 1px solid #dce1dd; border-radius: 15px; }
.shot-list li.uploaded { border-color: #9ac2a9; background: #f4faf6; }
.shot-number { display: grid; place-items: center; width: 42px; height: 42px; color: #1f6b4f; background: #e3eee6; border-radius: 50%; font-weight: 700; }
.shot-list strong { color: #173f32; }
.shot-list p { margin: 3px 0 0; color: #617069; font-size: .88rem; }
.upload-button { position: relative; overflow: hidden; color: #1f6b4f; border: 1px solid #a9c6b5; background: white; padding: 9px 13px; border-radius: 10px; font-size: .78rem; font-weight: 700; }
.upload-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.upload-button.disabled { opacity: .6; cursor: wait; }
.ready-shots { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; }
.ready-shots span { color: #245840; background: #e8f2eb; padding: 8px 12px; border-radius: 999px; font-size: .82rem; }
.caption-card { border-left: 4px solid #1f6b4f; background: #f5f8f4; padding: 20px 24px; border-radius: 0 14px 14px 0; margin: 25px 0; }
.caption-card p { color: #35483f; line-height: 1.7; }
.hashtags { color: #1f6b4f !important; }
.action-row { display: flex; justify-content: flex-end; gap: 12px; }
.export-ready, .success-panel { display: flex; gap: 16px; align-items: center; background: #edf7ef; border: 1px solid #c2dfc9; border-radius: 15px; padding: 18px; margin: 24px 0; }
.export-ready > span, .success-mark { display: grid; place-items: center; flex: 0 0 38px; height: 38px; border-radius: 50%; color: white; background: #1f6b4f; font-weight: 700; }
.export-ready strong, .success-panel strong { color: #173f32; }
.export-ready p, .success-panel p { margin: 4px 0 0; color: #607068; font-size: .8rem; }
.post-form { margin: 18px 0; }
.success-panel { align-items: flex-start; flex-wrap: wrap; }
.success-panel p { flex-basis: 100%; font-size: .9rem; line-height: 1.7; }
.notice { border-radius: 10px; padding: 11px 14px; font-size: .84rem; margin: 20px 0 0; }
.notice.success { color: #1f5d43; background: #e9f5ec; }
.notice.error { color: #8c352c; background: #fae9e6; }
.safety-note { color: #79837e; text-align: center; font-size: .75rem; margin: 28px 0 0; }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 12px; color: #597066; min-height: 350px; }

@media (max-width: 780px) {
  main { padding-top: 38px; }
  .hero { margin-bottom: 30px; }
  .workspace { grid-template-columns: 1fr; }
  .progress-card { position: static; }
  .progress-card ol { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .progress-card li { display: grid; justify-items: center; text-align: center; gap: 5px; font-size: .65rem; }
  .mission-card { border-radius: 20px; }
  .form-grid, .post-form { grid-template-columns: 1fr; }
  .wide, .full { grid-column: auto; }
  .shot-list li { grid-template-columns: 36px 1fr; }
  .upload-button { grid-column: 1 / -1; text-align: center; }
  .action-row { display: grid; }
}

@media (max-width: 450px) {
  .alpha-badge { display: none; }
  main, .topbar { padding-left: 16px; padding-right: 16px; }
  .proof-row { display: grid; }
  .progress-card { padding: 17px 12px; }
  .mission-card { padding: 25px 20px; }
  .section-number { display: none; }
}
</style>
