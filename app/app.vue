<script setup lang="ts">
import { canPostMission, captionText, missionProgress, missionStep, parseFacts, shouldRefreshExport, uploadedShotNumbers, validateMedia, validateProduct, validateProductReferenceMedia } from './lib/mission-flow'
import { createMissionApi, MissionApiError, PRIVACY_NOTICE_VERSION } from './services/mission-api'
import { createMissionSession } from './stores/mission-session'
import { createVisualQcPoller, visualQcDefects, visualQcDisplayState, visualQcScore } from './lib/visual-qc'
import type { VisualQcPoller } from './lib/visual-qc'
import type { MissionSession } from './stores/mission-session'
import type { Mission, ProductFacts } from './types/mission'

const config = useRuntimeConfig()
let session: MissionSession | null = null
const api = createMissionApi(
  config.public.missionApiBase,
  () => session?.getUserId() ?? '',
  globalThis.fetch,
  {
    requestMs: config.public.missionRequestTimeoutMs,
    longRequestMs: config.public.missionLongRequestTimeoutMs,
  },
)
const mission = ref<Mission | null>(null)
const busy = ref('')
const message = ref('')
const error = ref('')
const copied = ref(false)
const factsText = ref('')
const platform = ref('tiktok')
const postUrl = ref('')
const consentAccepted = ref(false)
const outcome = reactive({ views: 0, clicks: 0, sales: 0 })
const captureReviewed = ref(false)
const visualQcDecision = ref<'accept' | 'reject'>('accept')
const visualQcReason = ref('')
const product = reactive<ProductFacts>({ name: '', description: '', price: '', promotion: '', facts: [] })
const retryLabel = ref('')
let retryAction: (() => Promise<void>) | null = null
let visualQcPoller: VisualQcPoller | null = null

const progress = computed(() => missionProgress(mission.value))
const uploadedShots = computed(() => uploadedShotNumbers(mission.value))
const hasProductReference = computed(() => Boolean(mission.value?.productReferences?.length))
const exportProcessing = computed(() => mission.value?.state === 'exportQueued' || mission.value?.exportJob?.state === 'queued' || mission.value?.exportJob?.state === 'running')
const exportFailed = computed(() => mission.value?.exportJob?.state === 'failed')
const canPost = computed(() => canPostMission(mission.value))
const visualQcState = computed(() => visualQcDisplayState(mission.value?.visualQc))
const visualQcIssues = computed(() => visualQcDefects(mission.value?.visualQc))
const currentStep = computed(() => missionStep(mission.value, captureReviewed.value))

function setMission(next: Mission) {
  mission.value = next
  session?.saveMission(next)
}

function describeError(cause: unknown) {
  if (cause instanceof MissionApiError) {
    return cause.status >= 500
      ? 'ระบบยังไม่พร้อมชั่วคราว ข้อมูลของคุณยังอยู่ ลองอีกครั้งได้เลย'
      : cause.message
  }
  return 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'
}

async function run(label: string, action: () => Promise<Mission>, success: string, retryText = 'ลองอีกครั้ง') {
  busy.value = label
  error.value = ''
  message.value = ''
  try {
    setMission(await action())
    message.value = success
    retryAction = null
    retryLabel.value = ''
  }
  catch (cause) {
    error.value = describeError(cause)
    retryAction = () => run(label, action, success, retryText)
    retryLabel.value = retryText
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
  if (!session) return
  if (!consentAccepted.value) {
    error.value = 'กรุณายอมรับ Privacy Notice ก่อนเริ่มภารกิจ'
    return
  }
  await run('create', () => api.create(prepared, true, PRIVACY_NOTICE_VERSION), 'ภารกิจพร้อมแล้ว เริ่มถ่ายทีละช็อตได้เลย', 'ลองเริ่มภารกิจอีกครั้ง')
  if (mission.value) session.clearProductDraft()
}

async function uploadShot(shot: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!mission.value || !file) return
  const validation = validateMedia(file)
  if (validation) {
    error.value = validation
    input.value = ''
    return
  }
  captureReviewed.value = false
  await run(`shot-${shot}`, () => api.upload(mission.value!.id, shot, file), `บันทึกช็อต ${shot} แล้ว`, `ลองบันทึกช็อต ${shot} อีกครั้ง`)
  input.value = ''
}

async function uploadProductReference(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!mission.value || !file) return
  const validation = validateProductReferenceMedia(file)
  if (validation) {
    error.value = validation
    input.value = ''
    return
  }
  captureReviewed.value = false
  await run('product-reference', () => api.uploadProductReference(mission.value!.id, 1, file), 'บันทึกภาพสินค้าจริงแล้ว', 'ลองบันทึกภาพสินค้าอีกครั้ง')
  input.value = ''
}

function confirmCapture() {
  captureReviewed.value = true
  error.value = ''
  message.value = 'ตรวจครบแล้ว พร้อมสร้างโพสต์ฉบับร่าง'
}

async function generateDraft() {
  if (!mission.value) return
  await run('draft', () => api.generateDraft(mission.value!.id), 'โพสต์ฉบับร่างพร้อมแล้ว', 'ลองสร้างฉบับร่างอีกครั้ง')
}

async function prepareExport() {
  if (!mission.value) return
  await run('export', () => api.exportDraft(mission.value!.id), 'เตรียมงานส่งออกแนวตั้งพร้อมสำหรับขั้นตอนโพสต์แล้ว', 'ลองเตรียมงานส่งออกอีกครั้ง')
}

async function refreshMission() {
  if (!mission.value) return
  const refresh = shouldRefreshExport(mission.value)
    ? () => api.exportDraft(mission.value!.id)
    : () => api.get(mission.value!.id)
  await run('refresh', refresh, 'อัปเดตสถานะล่าสุดแล้ว', 'ลองตรวจสถานะอีกครั้ง')
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
  await run('posted', () => api.markPosted(mission.value!.id, platform.value, postUrl.value), 'เยี่ยมเลย บันทึกโพสต์แรกแล้ว', 'ลองบันทึกโพสต์อีกครั้ง')
}

async function recordOutcome() {
  if (!mission.value) return
  const { views, clicks, sales } = outcome
  if (![views, clicks, sales].every(Number.isInteger) || views < clicks || clicks < sales || sales < 0) {
    error.value = 'ตัวเลขต้องเป็นจำนวนเต็มและเรียงเป็น ยอดดู ≥ คลิก ≥ ยอดขาย'
    return
  }
  await run('outcome', () => api.recordOutcome(mission.value!.id, views, clicks, sales), 'บันทึกผลจริงแล้ว นี่คือก้าวถัดไปของคุณ', 'ลองบันทึกผลอีกครั้ง')
}

async function retryVisualQc() {
  if (!mission.value) return
  await run('visual-qc', () => api.requestVisualQc(mission.value!.id), 'เริ่มตรวจภาพอีกครั้งแล้ว คุณยังดาวน์โหลดหรือโพสต์ต่อได้', 'ลองตรวจภาพอีกครั้ง')
}

async function saveVisualQcOverride() {
  if (!mission.value) return
  const reason = visualQcReason.value.trim()
  if (!reason) {
    error.value = 'กรุณาบอกเหตุผลสั้น ๆ สำหรับการตัดสินใจของคุณ'
    return
  }
  await run('visual-qc-override', () => api.overrideVisualQc(mission.value!.id, visualQcDecision.value, reason), 'บันทึกการตัดสินใจของคุณแล้ว', 'ลองบันทึกการตัดสินใจอีกครั้ง')
  if (mission.value?.visualQc?.manualOverride) visualQcReason.value = ''
}

const platformUrls: Record<string, string> = {
  tiktok: 'https://www.tiktok.com/',
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  youtube: 'https://www.youtube.com/',
  shopee: 'https://shopee.co.th/',
  lazada: 'https://www.lazada.co.th/',
}

function openPlatform() {
  window.open(platformUrls[platform.value] || platformUrls.tiktok, '_blank', 'noopener,noreferrer')
}

async function retryLast() {
  if (retryAction) await retryAction()
}

function resetMission() {
  mission.value = null
  product.name = ''
  product.description = ''
  product.price = ''
  product.promotion = ''
  factsText.value = ''
  consentAccepted.value = false
  captureReviewed.value = false
  visualQcDecision.value = 'accept'
  visualQcReason.value = ''
  outcome.views = 0
  outcome.clicks = 0
  outcome.sales = 0
  message.value = ''
  error.value = ''
  retryAction = null
  retryLabel.value = ''
  session?.clearMission()
}

async function restoreMission() {
  const id = session?.activeMissionId()
  if (!id) return
  busy.value = 'restore'
  error.value = ''
  try {
    mission.value = await api.get(id)
  }
  catch (cause) {
    if (cause instanceof MissionApiError && cause.status === 404) {
      session?.clearMission()
      error.value = 'ไม่พบภารกิจเดิมแล้ว เริ่มภารกิจใหม่ได้เลย'
      return
    }
    error.value = describeError(cause)
    retryAction = restoreMission
    retryLabel.value = 'ลองเปิดภารกิจเดิมอีกครั้ง'
  }
  finally {
    busy.value = ''
  }
}

watch([() => product.name, () => product.description, () => product.price, () => product.promotion, factsText], () => {
  if (!session || mission.value) return
  session.saveProductDraft({ ...product, factsText: factsText.value })
})

watch(() => mission.value?.visualQc?.job?.state, (state) => {
  if (state === 'queued' || state === 'running') visualQcPoller?.start()
  else visualQcPoller?.stop()
})

onMounted(async () => {
  session = createMissionSession(localStorage)
  visualQcPoller = createVisualQcPoller({
    current: () => mission.value,
    refresh: id => api.get(id),
    update: setMission,
  })
  const saved = session.loadProductDraft()
  if (saved) {
    product.name = saved.name
    product.description = saved.description
    product.price = saved.price
    product.promotion = saved.promotion
    factsText.value = saved.factsText
  }
  await restoreMission()
  visualQcPoller.start()
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${config.app.baseURL}sw.js`, { scope: config.app.baseURL }).catch(() => {})
  }
})

onBeforeUnmount(() => visualQcPoller?.stop())
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#mission-workspace">ข้ามไปยังภารกิจ</a>
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

      <div id="mission-workspace" class="workspace">
        <MissionProgress :items="progress" :posted="Boolean(mission?.posted)" @reset="resetMission" />

        <section class="mission-card" aria-live="polite">
          <div v-if="busy === 'restore'" class="loading-state">
            <span class="spinner" /> กำลังเปิดภารกิจของคุณ…
          </div>

          <template v-else-if="currentStep === 'product'">
            <div class="section-number">01</div>
            <p class="section-label">เลือกสิ่งที่อยากลอง</p>
            <h2>วันนี้อยากเล่าเรื่องสินค้าอะไร?</h2>
            <p class="section-copy">เริ่มจากของที่มีอยู่แล้วหรือสินค้าที่ใช้จริง ไม่ต้องหาของใหม่ ขั้นถัดไปจะให้ถ่ายภาพหรือคลิปสินค้าจริง 3 ช็อต</p>

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
              <div class="consent wide">
                <label>
                  <input v-model="consentAccepted" type="checkbox">
                  <span>ฉันยอมรับ Privacy Notice และยินยอมให้ใช้ข้อมูล/ไฟล์ที่เลือกเพื่อสร้างภารกิจนี้</span>
                </label>
                <details>
                  <summary>อ่าน Privacy Notice แบบย่อ</summary>
                  <p>KWANNI ใช้ข้อมูลสินค้า ภาพ และคลิปเพื่อเตรียมโพสต์และบันทึกความคืบหน้า อัปโหลดเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้ และหยุดภารกิจได้ทุกเมื่อ</p>
                </details>
              </div>
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

            <div class="reference-card" :class="{ uploaded: hasProductReference }">
              <div>
                <strong>{{ hasProductReference ? '✓ มีภาพสินค้าจริงแล้ว' : 'เพิ่มภาพสินค้าจริง 1 ภาพ' }}</strong>
                <p>ใช้ตรวจสี รูปทรง และฉลาก เพื่อไม่ให้เนื้อหาบิดเบือนสินค้า</p>
              </div>
              <label class="upload-button" :class="{ disabled: Boolean(busy) }">
                {{ busy === 'product-reference' ? 'กำลังบันทึก…' : hasProductReference ? 'เปลี่ยนภาพ' : 'เลือกภาพสินค้า' }}
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" :disabled="Boolean(busy)" @change="uploadProductReference">
              </label>
            </div>

            <ol class="shot-list">
              <li v-for="shot in mission.shots" :key="shot.number" :class="{ uploaded: uploadedShots.has(shot.number) }">
                <div class="shot-number">{{ uploadedShots.has(shot.number) ? '✓' : shot.number }}</div>
                <div>
                  <strong>Shot {{ shot.number }}</strong>
                  <p>{{ shot.instruction }}</p>
                </div>
                <label class="upload-button" :class="{ disabled: Boolean(busy) }">
                  {{ busy === `shot-${shot.number}` ? 'กำลังบันทึก…' : uploadedShots.has(shot.number) ? 'เปลี่ยนไฟล์' : 'เลือกภาพ/คลิป' }}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,video/mp4"
                    capture="environment"
                    :disabled="Boolean(busy)"
                    @change="uploadShot(shot.number, $event)"
                  >
                </label>
              </li>
            </ol>
          </template>

          <template v-else-if="currentStep === 'review' && mission">
            <div class="section-number">03</div>
            <p class="section-label">ตรวจสิ่งที่ถ่าย</p>
            <h2>ครบแล้ว ตรวจอีกครั้งก่อนสร้างโพสต์</h2>
            <p class="section-copy">ถ้ามีภาพผิดหรือไม่ชัด เปลี่ยนได้ตอนนี้ เมื่อยืนยันแล้วจึงค่อยสร้างฉบับร่าง</p>

            <div class="review-list">
              <div class="review-item">
                <div><strong>✓ ภาพสินค้าจริง</strong><p>ใช้ยืนยันสี รูปทรง และฉลาก</p></div>
                <label class="upload-button" :class="{ disabled: Boolean(busy) }">
                  {{ busy === 'product-reference' ? 'กำลังเปลี่ยน…' : 'เปลี่ยนภาพ' }}
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" :disabled="Boolean(busy)" @change="uploadProductReference">
                </label>
              </div>
              <div v-for="shot in mission.shots" :key="shot.number" class="review-item">
                <div><strong>✓ Shot {{ shot.number }}</strong><p>{{ shot.instruction }}</p></div>
                <label class="upload-button" :class="{ disabled: Boolean(busy) }">
                  {{ busy === `shot-${shot.number}` ? 'กำลังเปลี่ยน…' : 'เปลี่ยนไฟล์' }}
                  <input type="file" accept="image/jpeg,image/png,video/mp4" capture="environment" :disabled="Boolean(busy)" @change="uploadShot(shot.number, $event)">
                </label>
              </div>
            </div>
            <button class="primary full" type="button" :disabled="Boolean(busy)" @click="confirmCapture">ยืนยันภาพและ 3 ช็อต →</button>
          </template>

          <template v-else-if="currentStep === 'draft' && mission">
            <div class="section-number">04</div>
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
            <div class="section-number">05</div>
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
            <div class="section-number">06</div>
            <p class="section-label">โพสต์และบันทึกผล</p>
            <h2 v-if="!mission.posted">พร้อมลองตลาดแล้ว</h2>
            <h2 v-else>โพสต์แรกสำเร็จแล้ว 🎉</h2>

            <section class="visual-qc" :class="`qc-${visualQcState}`" aria-labelledby="visual-qc-title">
              <div class="visual-qc-heading">
                <div>
                  <span>Visual QC · คำแนะนำ</span>
                  <strong id="visual-qc-title">ตรวจภาพและความต่อเนื่อง</strong>
                </div>
                <span v-if="mission.visualQc?.latestReport" class="qc-score">{{ visualQcScore(mission.visualQc.latestReport.score) }}</span>
              </div>

              <p v-if="visualQcState === 'checking'">กำลังตรวจ keyframes แบบเบื้องหลัง คุณดาวน์โหลดและโพสต์ต่อได้เลย</p>
              <p v-else-if="visualQcState === 'passed'">ไม่พบจุดที่ต้องระวังตามเกณฑ์ภาพยนตร์ของรอบนี้</p>
              <p v-else-if="visualQcState === 'attention'">มีข้อสังเกตให้ตรวจด้วยตาอีกครั้งก่อนใช้จริง</p>
              <p v-else-if="visualQcState === 'unavailable'">{{ mission.visualQc?.warning || 'ระบบตรวจภาพยังไม่พร้อมชั่วคราว' }}</p>
              <p v-else>ยังไม่มีผลตรวจภาพ คุณเริ่มตรวจเมื่อสะดวกหรือโพสต์ต่อได้</p>

              <div v-if="mission.visualQc?.latestReport" class="qc-evidence">
                <span>หลักฐาน {{ mission.visualQc.latestReport.evidenceFrames.length }} เฟรม</span>
                <span>{{ mission.visualQc.latestReport.shots.length }} ช็อต</span>
                <span>เกณฑ์ {{ visualQcScore(mission.visualQc.latestReport.threshold) }}</span>
                <span>โมเดล {{ mission.visualQc.latestReport.modelRevision }}</span>
              </div>

              <ul v-if="visualQcIssues.length" class="qc-defects">
                <li v-for="(defect, index) in visualQcIssues" :key="`${defect.code}-${index}`" :class="`severity-${defect.severity}`">
                  <strong>{{ defect.severity === 'critical' ? 'ควรตรวจ' : defect.severity === 'warning' ? 'ข้อสังเกต' : 'ข้อมูล' }}</strong>
                  <span>{{ defect.message }}</span>
                  <small v-if="defect.evidenceFrameIds.length">อ้างอิง {{ defect.evidenceFrameIds.length }} เฟรม</small>
                </li>
              </ul>

              <div v-if="mission.visualQc?.manualOverride" class="qc-override-saved">
                <strong>บันทึกโดยผู้ใช้: {{ mission.visualQc.manualOverride.decision === 'accept' ? 'ยอมรับวิดีโอนี้' : 'ไม่ใช้วิดีโอนี้' }}</strong>
                <span>{{ mission.visualQc.manualOverride.reason }}</span>
              </div>

              <div class="qc-actions">
                <button v-if="visualQcState === 'idle' || visualQcState === 'unavailable'" class="secondary" type="button" :disabled="Boolean(busy)" @click="retryVisualQc">
                  {{ busy === 'visual-qc' ? 'กำลังเริ่มตรวจ…' : 'ลองตรวจภาพ' }}
                </button>
                <details>
                  <summary>บันทึกการตัดสินใจด้วยตัวเอง</summary>
                  <form class="qc-override-form" @submit.prevent="saveVisualQcOverride">
                    <label><span>การตัดสินใจ</span><select v-model="visualQcDecision"><option value="accept">ยอมรับและใช้วิดีโอนี้</option><option value="reject">ไม่ใช้วิดีโอนี้</option></select></label>
                    <label><span>เหตุผล</span><input v-model="visualQcReason" maxlength="300" placeholder="เช่น ตรวจสินค้าแล้วตรงกับภาพจริง"></label>
                    <button class="secondary" type="submit" :disabled="Boolean(busy)">{{ busy === 'visual-qc-override' ? 'กำลังบันทึก…' : 'บันทึกการตัดสินใจ' }}</button>
                  </form>
                </details>
              </div>
              <small class="qc-advisory">ผลตรวจนี้เป็นคำแนะนำ ไม่ขวางการดาวน์โหลด การโพสต์ หรือการตัดสินใจของคุณ</small>
            </section>

            <template v-if="!mission.posted">
              <div class="export-ready">
                <span>{{ exportFailed ? '!' : exportProcessing ? '…' : '✓' }}</span>
                <div>
                  <strong v-if="exportFailed">เตรียมไฟล์ไม่สำเร็จ</strong>
                  <strong v-else-if="exportProcessing">กำลังเตรียมไฟล์แนวตั้ง</strong>
                  <strong v-else>ไฟล์แนวตั้งพร้อมแล้ว</strong>
                  <p v-if="exportFailed">งานเดิมไม่หาย กดลองอีกครั้งได้โดยไม่สร้างงานซ้ำ</p>
                  <p v-else>{{ mission.export?.width }} × {{ mission.export?.height }} · MP4</p>
                </div>
              </div>
              <div v-if="exportProcessing || exportFailed" class="action-row post-actions">
                <button class="secondary" type="button" :disabled="Boolean(busy)" @click="refreshMission">
                  {{ busy === 'refresh' ? 'กำลังตรวจ…' : 'ตรวจสถานะอีกครั้ง' }}
                </button>
                <button v-if="exportFailed" class="primary" type="button" :disabled="Boolean(busy)" @click="prepareExport">ลองเตรียมไฟล์อีกครั้ง</button>
              </div>
              <a v-if="mission.export?.downloadUrl && canPost" class="download-link full" :href="mission.export.downloadUrl" download>ดาวน์โหลดวิดีโอ ↓</a>
              <div class="action-row post-actions">
                <button class="secondary" type="button" @click="copyCaption">
                  {{ copied ? '✓ คัดลอกแล้ว' : 'คัดลอก Caption' }}
                </button>
                <button class="secondary" type="button" @click="openPlatform">เปิดแพลตฟอร์มที่เลือก ↗</button>
              </div>
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
              <button class="primary full" type="button" :disabled="Boolean(busy) || !canPost" @click="markPosted">
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
              <form v-if="!mission.outcome" class="outcome-form" @submit.prevent="recordOutcome">
                <p>เมื่อมีข้อมูล กลับมาบันทึกผลจริงได้ ไม่จำเป็นต้องมียอดขาย</p>
                <div class="outcome-grid">
                  <label><span>ยอดดู</span><input v-model.number="outcome.views" type="number" min="0" inputmode="numeric"></label>
                  <label><span>คลิก</span><input v-model.number="outcome.clicks" type="number" min="0" inputmode="numeric"></label>
                  <label><span>ยอดขาย</span><input v-model.number="outcome.sales" type="number" min="0" inputmode="numeric"></label>
                </div>
                <button class="secondary full" type="submit" :disabled="Boolean(busy)">{{ busy === 'outcome' ? 'กำลังบันทึก…' : 'บันทึกผลและดูก้าวถัดไป' }}</button>
              </form>
              <div v-else-if="mission.nextAction" class="next-action">
                <span>ก้าวถัดไป</span>
                <strong>{{ mission.nextAction.title }}</strong>
                <p>{{ mission.nextAction.reason }}</p>
              </div>
              <button class="primary full" type="button" @click="resetMission">เริ่มภารกิจถัดไป →</button>
            </template>
          </template>

          <p v-if="message" class="notice success" role="status">✓ {{ message }}</p>
          <div v-if="error" class="notice error" role="alert">
            <span>{{ error }}</span>
            <button v-if="retryAction" type="button" :disabled="Boolean(busy)" @click="retryLast">{{ retryLabel }}</button>
          </div>
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
.skip-link { position: fixed; z-index: 10; left: 12px; top: -60px; color: white; background: #173f32; padding: 10px 14px; border-radius: 8px; }
.skip-link:focus { top: 12px; }
:focus-visible { outline: 3px solid #e79757; outline-offset: 3px; }

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
.reference-card { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 18px; padding: 16px; border: 1px dashed #c2aaa0; border-radius: 14px; background: #fffaf6; }
.reference-card.uploaded { border-style: solid; border-color: #9ac2a9; background: #f4faf6; }
.reference-card p { margin: 4px 0 0; color: #617069; font-size: .82rem; }
.consent { padding: 14px; border-radius: 12px; background: #f5f8f4; }
.consent label { display: flex; align-items: flex-start; gap: 10px; }
.consent input { width: 18px; height: 18px; flex: 0 0 auto; }
.consent summary { margin-top: 9px; color: #1f6b4f; cursor: pointer; font-size: .8rem; }
.consent p { color: #607068; line-height: 1.6; font-size: .78rem; }
.shot-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.shot-list li { display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 15px; padding: 18px; border: 1px solid #dce1dd; border-radius: 15px; }
.shot-list li.uploaded { border-color: #9ac2a9; background: #f4faf6; }
.shot-number { display: grid; place-items: center; width: 42px; height: 42px; color: #1f6b4f; background: #e3eee6; border-radius: 50%; font-weight: 700; }
.shot-list strong { color: #173f32; }
.shot-list p { margin: 3px 0 0; color: #617069; font-size: .88rem; }
.review-list { display: grid; gap: 10px; margin: 22px 0; }
.review-item { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 15px; border: 1px solid #c8ddce; border-radius: 13px; background: #f4faf6; }
.review-item p { margin: 3px 0 0; color: #617069; font-size: .82rem; }
.upload-button { position: relative; overflow: hidden; color: #1f6b4f; border: 1px solid #a9c6b5; background: white; padding: 9px 13px; border-radius: 10px; font-size: .78rem; font-weight: 700; }
.upload-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.upload-button.disabled { opacity: .6; cursor: wait; }
.ready-shots { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; }
.ready-shots span { color: #245840; background: #e8f2eb; padding: 8px 12px; border-radius: 999px; font-size: .82rem; }
.caption-card { border-left: 4px solid #1f6b4f; background: #f5f8f4; padding: 20px 24px; border-radius: 0 14px 14px 0; margin: 25px 0; }
.caption-card p { color: #35483f; line-height: 1.7; }
.hashtags { color: #1f6b4f !important; }
.action-row { display: flex; justify-content: flex-end; gap: 12px; }
.post-actions { margin: 14px 0; }
.download-link { display: flex; justify-content: center; align-items: center; min-height: 52px; margin: 14px 0; border-radius: 13px; color: white; background: #1f6b4f; font-weight: 700; text-decoration: none; }
.visual-qc { display: grid; gap: 13px; margin: 22px 0; padding: 18px; border: 1px solid #d6ddd8; border-radius: 16px; background: #f8faf8; }
.visual-qc.qc-passed { border-color: #a8cdb4; background: #f3faf5; }
.visual-qc.qc-attention, .visual-qc.qc-unavailable { border-color: #e0c59d; background: #fffaf1; }
.visual-qc-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.visual-qc-heading > div { display: grid; gap: 3px; }
.visual-qc-heading span { color: #69766f; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
.visual-qc-heading strong { color: #173f32; }
.visual-qc > p { margin: 0; color: #53625d; line-height: 1.6; }
.qc-score { display: grid; place-items: center; min-width: 54px; height: 38px; border-radius: 999px; color: #1f6b4f !important; background: white; border: 1px solid #bdd2c4; font-size: .9rem !important; }
.qc-evidence { display: flex; flex-wrap: wrap; gap: 7px; }
.qc-evidence span { padding: 5px 9px; border-radius: 999px; color: #53625d; background: white; font-size: .7rem; }
.qc-defects { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.qc-defects li { display: grid; grid-template-columns: auto 1fr auto; gap: 9px; align-items: center; padding: 10px; border-left: 3px solid #99aaa1; background: rgba(255,255,255,.7); }
.qc-defects li.severity-critical { border-color: #b64539; }
.qc-defects li.severity-warning { border-color: #d38a3d; }
.qc-defects strong, .qc-defects small { font-size: .7rem; }
.qc-defects span { color: #44534c; font-size: .82rem; }
.qc-override-saved { display: grid; gap: 3px; padding: 11px; border-radius: 10px; background: #eaf4ed; font-size: .8rem; }
.qc-actions { display: flex; align-items: flex-start; gap: 12px; }
.qc-actions details { flex: 1; }
.qc-actions summary { color: #1f6b4f; cursor: pointer; font-size: .8rem; font-weight: 700; padding: 9px 0; }
.qc-override-form { display: grid; gap: 10px; padding-top: 9px; }
.qc-advisory { color: #737f79; line-height: 1.5; }
.export-ready, .success-panel { display: flex; gap: 16px; align-items: center; background: #edf7ef; border: 1px solid #c2dfc9; border-radius: 15px; padding: 18px; margin: 24px 0; }
.export-ready > span, .success-mark { display: grid; place-items: center; flex: 0 0 38px; height: 38px; border-radius: 50%; color: white; background: #1f6b4f; font-weight: 700; }
.export-ready strong, .success-panel strong { color: #173f32; }
.export-ready p, .success-panel p { margin: 4px 0 0; color: #607068; font-size: .8rem; }
.post-form { margin: 18px 0; }
.outcome-form { margin: 20px 0; padding: 18px; border: 1px solid #dce1dd; border-radius: 15px; }
.outcome-form > p { margin-top: 0; color: #607068; }
.outcome-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
.next-action { display: grid; gap: 6px; margin: 20px 0; padding: 18px; border-radius: 15px; background: #fff7e9; }
.next-action span { color: #b15d38; font-size: .75rem; font-weight: 700; }
.next-action p { margin: 0; color: #607068; }
.success-panel { align-items: flex-start; flex-wrap: wrap; }
.success-panel p { flex-basis: 100%; font-size: .9rem; line-height: 1.7; }
.notice { border-radius: 10px; padding: 11px 14px; font-size: .84rem; margin: 20px 0 0; }
.notice.success { color: #1f5d43; background: #e9f5ec; }
.notice.error { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #8c352c; background: #fae9e6; }
.notice.error button { flex: 0 0 auto; color: #7a2f28; border: 1px solid #dba9a2; border-radius: 8px; background: white; padding: 7px 10px; font-weight: 700; }
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
  .reference-card { align-items: stretch; flex-direction: column; }
  .review-item { align-items: stretch; flex-direction: column; }
  .outcome-grid { grid-template-columns: 1fr; }
  .qc-defects li { grid-template-columns: 1fr; }
  .qc-actions { flex-direction: column; }
  .qc-actions details { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
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
