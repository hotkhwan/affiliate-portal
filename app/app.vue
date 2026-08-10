<script setup lang="ts">
import { canPostMission, captionText, missionProgress, missionStep, parseFacts, validateProduct, validateProductReferenceMedia } from './lib/mission-flow'
import { createMissionApi, MissionApiError, PRIVACY_NOTICE_VERSION } from './services/mission-api'
import { createMissionSession } from './stores/mission-session'
import { createVisualQcPoller, visualQcDefects, visualQcDisplayState, visualQcScore } from './lib/visual-qc'
import { createExportPoller } from './lib/export-polling'
import { detectLocale, localeOptions, translate } from './i18n'
import type { VisualQcPoller } from './lib/visual-qc'
import type { ExportPoller } from './lib/export-polling'
import type { Locale } from './i18n'
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
const copiedPrompt = ref('')
const selectedProvider = ref<'wan' | 'veo' | 'seedance'>('wan')
const localVideoEnabled = String(config.public.localVideoEnabled).toLowerCase() === 'true'
const draftActivityIndex = ref(0)
const draftElapsedSeconds = ref(0)
const generationActivityIndex = ref(0)
const factsText = ref('')
const platform = ref('tiktok')
const postUrl = ref('')
const consentAccepted = ref(false)
const outcome = reactive({ views: 0, clicks: 0, sales: 0 })
const visualQcDecision = ref<'accept' | 'reject'>('accept')
const visualQcReason = ref('')
const locale = ref<Locale>('th')
const product = reactive<ProductFacts>({ name: '', description: '', price: '', promotion: '', facts: [] })
const retryLabel = ref('')
let retryAction: (() => Promise<void>) | null = null
let visualQcPoller: VisualQcPoller | null = null
let exportPoller: ExportPoller | null = null
let draftActivityTimer: ReturnType<typeof setInterval> | null = null
let generationActivityTimer: ReturnType<typeof setInterval> | null = null

const localeStorageKey = 'kwanni.locale.v1'
const tr = (source: string, values: Record<string, string | number> = {}) => translate(locale.value, source, values)

function setLocale(next: Locale) {
  locale.value = next
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : next
  if (typeof localStorage !== 'undefined') localStorage.setItem(localeStorageKey, next)
}

function changeLocale(event: Event) {
  const next = (event.target as HTMLSelectElement).value
  if (next === 'th' || next === 'zh' || next === 'en') setLocale(next)
}

const progress = computed(() => missionProgress(mission.value).map(item => ({ ...item, label: tr(item.label) })))
const hasProductReference = computed(() => Boolean(mission.value?.productReferences?.length))
const productReference = computed(() => mission.value?.productReferences?.[0])
const exportProcessing = computed(() => mission.value?.state === 'videoGenerating' || mission.value?.state === 'exportQueued' || mission.value?.exportJob?.state === 'queued' || mission.value?.exportJob?.state === 'running')
const exportFailed = computed(() => mission.value?.videoGeneration?.state === 'failed' || mission.value?.exportJob?.state === 'failed')
const videoGenerating = computed(() => mission.value?.state === 'videoGenerating')
const canPost = computed(() => canPostMission(mission.value))
const visualQcState = computed(() => visualQcDisplayState(mission.value?.visualQc))
const visualQcIssues = computed(() => visualQcDefects(mission.value?.visualQc))
const currentStep = computed(() => missionStep(mission.value))
const draftActivities = computed(() => [
  tr('กำลังส่งข้อมูลไปยัง Local Qwen'),
  tr('Creative Director กำลังหา hook ที่น่าหยุดดู'),
  tr('Story Director กำลังเรียงเรื่องให้จบใน 8 วินาที'),
  tr('Cinematography กำลังออกแบบกล้องและ 3 ช็อต'),
  tr('Lighting Director กำลังจัดแสงให้สินค้าเด่น'),
  tr('Brand Guard กำลังตรวจข้อเท็จจริงและสิ่งที่ห้ามเพี้ยน'),
  tr('Prompt Compiler กำลังเขียนคำสั่งสร้างวิดีโอสำหรับ Veo และ Seedance'),
])
const currentDraftActivity = computed(() => draftActivities.value[Math.min(draftActivityIndex.value, draftActivities.value.length - 1)])
const generationActivities = computed(() => [
  tr('กำลังอ่านภาพสินค้าและล็อกรายละเอียดสำคัญ'),
  tr('กำลังสร้างการเคลื่อนไหวช่วงเปิดเรื่อง'),
  tr('กำลังเชื่อม 3 จังหวะของเรื่องให้ต่อเนื่อง'),
  tr('กำลังรักษาสี รูปทรง ฉลาก และโลโก้'),
  tr('กำลังเรนเดอร์เฟรมสุดท้ายและเข้ารหัส MP4'),
])
const currentGenerationActivity = computed(() => generationActivities.value[generationActivityIndex.value % generationActivities.value.length])

function setMission(next: Mission) {
  mission.value = next
  if (next.videoGeneration?.provider) selectedProvider.value = next.videoGeneration.provider
  session?.saveMission(next)
}

function describeError(cause: unknown) {
  if (cause instanceof MissionApiError) {
    return cause.status >= 500
      ? tr('ระบบยังไม่พร้อมชั่วคราว ข้อมูลของคุณยังอยู่ ลองอีกครั้งได้เลย')
      : cause.status === 409 ? tr('ขั้นตอนนี้ยังไม่พร้อม ระบบกำลังทำงานก่อนหน้าให้เสร็จ') : cause.message
  }
  return tr('เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง')
}

async function run(label: string, action: () => Promise<Mission>, success: string, retryText = tr('ลองอีกครั้ง')) {
  busy.value = label
  error.value = ''
  message.value = ''
  try {
    setMission(await action())
    message.value = tr(success)
    retryAction = null
    retryLabel.value = ''
  }
  catch (cause) {
    error.value = describeError(cause)
    retryAction = () => run(label, action, success, retryText)
    retryLabel.value = tr(retryText)
  }
  finally {
    busy.value = ''
  }
}

async function startMission() {
  const prepared = { ...product, facts: parseFacts(factsText.value) }
  const validation = validateProduct(prepared)
  if (validation) {
    error.value = tr(validation)
    return
  }
  if (!session) return
  if (!consentAccepted.value) {
    error.value = tr('กรุณายอมรับ Privacy Notice ก่อนเริ่มภารกิจ')
    return
  }
  await run('create', () => api.create(prepared, true, PRIVACY_NOTICE_VERSION, locale.value), 'ภารกิจพร้อมแล้ว เพิ่มภาพสินค้า 1 ภาพได้เลย', 'ลองเริ่มภารกิจอีกครั้ง')
  if (mission.value) session.clearProductDraft()
}

async function uploadProductReference(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!mission.value || !file) return
  const validation = validateProductReferenceMedia(file)
  if (validation) {
    error.value = tr(validation)
    input.value = ''
    return
  }
  await run('product-reference', () => api.uploadProductReference(mission.value!.id, 1, file), 'บันทึกภาพสินค้าจริงแล้ว', 'ลองบันทึกภาพสินค้าอีกครั้ง')
  input.value = ''
}

async function generateDraft() {
  if (!mission.value) return
  await run('draft', () => api.generateDraft(mission.value!.id), 'แผน 3 ช็อตและ Prompt พร้อมแล้ว', 'ลองสร้างแผนอีกครั้ง')
}

async function prepareExport() {
  if (!mission.value) return
  await run('export', () => api.exportDraft(mission.value!.id), 'เตรียมงานส่งออกแนวตั้งพร้อมสำหรับขั้นตอนโพสต์แล้ว', 'ลองเตรียมงานส่งออกอีกครั้ง')
}

async function generateVideo() {
  if (!mission.value) return
  if (!localVideoEnabled) {
    error.value = tr('Local Preview เปิดเฉพาะช่วงทดสอบที่มีผู้ดูแล จนกว่าระบบ Login และโควตาจะพร้อม')
    return
  }
  await run('generate-video', () => api.generateVideo(mission.value!.id, selectedProvider.value), 'Local Preview เข้าคิวแล้ว ปิดหน้านี้และกลับมาดาวน์โหลดภายหลังได้', 'ลองสร้างวิดีโออีกครั้ง')
  exportPoller?.start()
}

function estimatedReadyLabel(): string {
  const value = mission.value?.videoGeneration?.estimatedReadyAt
  if (!value) return tr('ประมาณ 20–40 นาที')
  return new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : locale.value === 'en' ? 'en' : 'th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function generationStateLabel(state: string): string {
  const labels: Record<string, string> = {
    queued: 'รอคิวสร้างวิดีโอ', rendering: 'กำลังสร้างช็อต', verifying: 'กำลังตรวจสินค้าและภาพยนตร์', revising: 'Qwen กำลังแก้ช็อตนี้', assembling: 'กำลังรวมวิดีโอ', succeeded: 'ผ่าน', failed: 'ไม่ผ่าน',
  }
  return tr(labels[state] || state)
}

function percent(value?: number): string {
  return `${Math.round((value ?? 0) * 100)}%`
}

async function refreshMission() {
  if (!mission.value) return
  const refresh = () => api.get(mission.value!.id)
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
    error.value = tr('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกแทน')
  }
}

async function copyProviderPrompt(provider: 'veo' | 'seedance') {
  const value = mission.value?.draft?.renderPrompts?.[provider]?.prompt
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copiedPrompt.value = provider
    setTimeout(() => { copiedPrompt.value = '' }, 1800)
  }
  catch {
    error.value = tr('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกแทน')
  }
}

function shotSummary(shot: Record<string, unknown>): string {
  return [shot.shotSize, shot.cameraAngle, shot.cameraMovement, shot.subjectAction]
    .filter(value => typeof value === 'string' && value)
    .join(' · ')
}

async function markPosted() {
  if (!mission.value) return
  await run('posted', () => api.markPosted(mission.value!.id, platform.value, postUrl.value), 'เยี่ยมเลย บันทึกโพสต์แรกแล้ว', 'ลองบันทึกโพสต์อีกครั้ง')
}

async function recordOutcome() {
  if (!mission.value) return
  const { views, clicks, sales } = outcome
  if (![views, clicks, sales].every(Number.isInteger) || views < clicks || clicks < sales || sales < 0) {
    error.value = tr('ตัวเลขต้องเป็นจำนวนเต็มและเรียงเป็น ยอดดู ≥ คลิก ≥ ยอดขาย')
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
    error.value = tr('กรุณาบอกเหตุผลสั้น ๆ สำหรับการตัดสินใจของคุณ')
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
    setMission(await api.get(id))
  }
  catch (cause) {
    if (cause instanceof MissionApiError && cause.status === 404) {
      session?.clearMission()
      error.value = tr('ไม่พบภารกิจเดิมแล้ว เริ่มภารกิจใหม่ได้เลย')
      return
    }
    error.value = describeError(cause)
    retryAction = restoreMission
    retryLabel.value = tr('ลองเปิดภารกิจเดิมอีกครั้ง')
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

watch(exportProcessing, (pending) => {
  if (pending) exportPoller?.start()
  else exportPoller?.stop()
})

watch(videoGenerating, (pending) => {
  if (generationActivityTimer) clearInterval(generationActivityTimer)
  generationActivityTimer = null
  if (!pending) return
  generationActivityIndex.value = 0
  generationActivityTimer = setInterval(() => { generationActivityIndex.value += 1 }, 5000)
}, { immediate: true })

watch(busy, (state) => {
  if (draftActivityTimer) clearInterval(draftActivityTimer)
  if (generationActivityTimer) clearInterval(generationActivityTimer)
  draftActivityTimer = null
  if (state !== 'draft') return
  draftActivityIndex.value = 0
  draftElapsedSeconds.value = 0
  draftActivityTimer = setInterval(() => {
    draftElapsedSeconds.value += 1
    if (draftElapsedSeconds.value % 5 === 0 && draftActivityIndex.value < draftActivities.value.length - 1) draftActivityIndex.value += 1
  }, 1000)
})

onMounted(async () => {
  const savedLocale = localStorage.getItem(localeStorageKey)
  setLocale(savedLocale === 'th' || savedLocale === 'zh' || savedLocale === 'en' ? savedLocale : detectLocale(navigator.languages))
  session = createMissionSession(localStorage)
  visualQcPoller = createVisualQcPoller({
    current: () => mission.value,
    refresh: id => api.get(id),
    update: setMission,
  })
  exportPoller = createExportPoller({
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
  exportPoller.start()
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${config.app.baseURL}sw.js`, { scope: config.app.baseURL }).catch(() => {})
  }
})

onBeforeUnmount(() => {
  visualQcPoller?.stop()
  exportPoller?.stop()
  if (draftActivityTimer) clearInterval(draftActivityTimer)
})
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#mission-workspace">{{ tr('ข้ามไปยังภารกิจ') }}</a>
    <header class="topbar">
      <a class="brand" href="#top" :aria-label="tr('KWANNI หน้าแรก')">
        <span class="brand-mark">K</span>
        <span>KWANNI</span>
      </a>
      <div class="topbar-actions">
        <label class="locale-picker">
          <span>{{ tr('เลือกภาษา') }}</span>
          <select :value="locale" :aria-label="tr('เลือกภาษา')" @change="changeLocale">
            <option v-for="option in localeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <span class="alpha-badge">{{ tr('Alpha · ภารกิจแรก') }}</span>
      </div>
    </header>

    <main id="top">
      <section class="hero">
        <p class="eyebrow">{{ tr('KWANNI Creative Brain') }}</p>
        <h1>{{ tr('ภาพสินค้า 1 ภาพ') }}<br><span>{{ tr('สู่แผนวิดีโอระดับมืออาชีพ') }}</span></h1>
        <p class="hero-copy">{{ tr('บอกข้อเท็จจริงของสินค้า เพิ่มภาพอ้างอิงเพียง 1 ภาพ แล้วทีม Creative จะสร้างแผน 3 ช็อตและ Prompt สำหรับ Veo / Seedance') }}</p>
        <div class="proof-row" :aria-label="tr('สิ่งที่ไม่จำเป็นต้องทำ')">
          <span>{{ tr('✓ ไม่ต้องเขียน Prompt') }}</span>
          <span>{{ tr('✓ ไม่ต้องตัดต่อเป็น') }}</span>
          <span>{{ tr('✓ ไม่ต้องซื้อ Credit') }}</span>
        </div>
      </section>

      <div id="mission-workspace" class="workspace">
        <MissionProgress
          :items="progress"
          :posted="Boolean(mission?.posted)"
          :heading="tr('ก้าวของคุณ')"
          :aria-label="tr('ความคืบหน้าภารกิจ')"
          :reset-label="tr('เริ่มภารกิจถัดไป →')"
          @reset="resetMission"
        />

        <section class="mission-card" aria-live="polite">
          <div v-if="busy === 'restore'" class="loading-state">
            <span class="spinner" /> {{ tr('กำลังเปิดภารกิจของคุณ…') }}
          </div>

          <template v-else-if="currentStep === 'product'">
            <div class="section-number">01</div>
            <p class="section-label">{{ tr('เลือกสิ่งที่อยากลอง') }}</p>
            <h2>{{ tr('วันนี้อยากเล่าเรื่องสินค้าอะไร?') }}</h2>
            <p class="section-copy">{{ tr('เริ่มจากสินค้าที่มีอยู่จริง ระบุเฉพาะข้อเท็จจริง ขั้นถัดไปใช้ภาพสินค้าเพียง 1 ภาพ') }}</p>

            <form class="form-grid" @submit.prevent="startMission">
              <label class="wide">
                <span>{{ tr('ชื่อสินค้า') }} <b>*</b></span>
                <input v-model="product.name" autocomplete="off" :placeholder="tr('เช่น กล่องจัดระเบียบของเล่น')">
              </label>
              <label class="wide">
                <span>{{ tr('ใช้ทำอะไร') }} <b>*</b></span>
                <textarea v-model="product.description" rows="3" :placeholder="tr('เช่น ช่วยแยกของเล่นให้หยิบง่ายและเก็บเร็วขึ้น')" />
              </label>
              <label>
                <span>{{ tr('ราคา (ถ้ามี)') }}</span>
                <input v-model="product.price" autocomplete="off" :placeholder="tr('เช่น 299 บาท')">
              </label>
              <label>
                <span>{{ tr('โปรโมชันจริง (ถ้ามี)') }}</span>
                <input v-model="product.promotion" autocomplete="off" :placeholder="tr('เช่น ส่งฟรีถึงวันอาทิตย์')">
              </label>
              <label class="wide">
                <span>{{ tr('ข้อเท็จจริงที่อยากบอก (บรรทัดละข้อ)') }}</span>
                <textarea v-model="factsText" rows="3" :placeholder="tr('เช่น มีล้อเลื่อน\nฝาปิดถอดได้')" />
              </label>
              <div class="consent wide">
                <label>
                  <input v-model="consentAccepted" type="checkbox">
                  <span>{{ tr('ฉันยอมรับ Privacy Notice และยินยอมให้ใช้ข้อมูล/ไฟล์ที่เลือกเพื่อสร้างภารกิจนี้') }}</span>
                </label>
                <details>
                  <summary>{{ tr('อ่าน Privacy Notice แบบย่อ') }}</summary>
                  <p>{{ tr('KWANNI ใช้ข้อมูลสินค้า ภาพ และคลิปเพื่อเตรียมโพสต์และบันทึกความคืบหน้า อัปโหลดเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้ และหยุดภารกิจได้ทุกเมื่อ') }}</p>
                </details>
              </div>
              <button class="primary wide" type="submit" :disabled="Boolean(busy)">
                <span v-if="busy === 'create'" class="spinner" />
                {{ busy === 'create' ? tr('กำลังเตรียมภารกิจ') : tr('เริ่มภารกิจแรก') }}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </template>

          <template v-else-if="currentStep === 'capture' && mission">
            <div class="section-number">02</div>
            <p class="section-label">{{ tr('ภาพอ้างอิงสินค้า') }}</p>
            <h2>{{ tr('เพิ่มภาพสินค้าจริง 1 ภาพ') }}</h2>
            <p class="section-copy">{{ tr('ถ่ายให้เห็นสี รูปทรง ฉลาก และโลโก้ชัดเจน ภาพนี้จะเป็น source of truth ให้ทีม Creative') }}</p>

            <div class="product-chip">
              <span>{{ tr('ภารกิจวันนี้') }}</span>
              <strong>{{ mission.product.name }}</strong>
            </div>

            <div class="reference-card" :class="{ uploaded: hasProductReference }">
              <div>
                <strong>{{ hasProductReference ? tr('✓ มีภาพสินค้าจริงแล้ว') : tr('เลือกภาพสินค้า') }}</strong>
                <p>{{ tr('JPG, PNG หรือ WebP · ไม่เกิน 8 MB') }}</p>
              </div>
              <label class="upload-button" :class="{ disabled: Boolean(busy) }">
                {{ busy === 'product-reference' ? tr('กำลังบันทึก…') : hasProductReference ? tr('เปลี่ยนภาพ') : tr('เลือกภาพสินค้า') }}
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" :disabled="Boolean(busy)" @change="uploadProductReference">
              </label>
            </div>

          </template>

          <template v-else-if="currentStep === 'draft' && mission">
            <div class="section-number">03</div>
            <p class="section-label">{{ tr('ทีม Creative พร้อมทำงาน') }}</p>
            <h2>{{ tr('ให้ทีมงานขั้นเทพวางแผนวิดีโอ') }}</h2>
            <p class="section-copy">{{ tr('Creative Director, Story Director, Cinematography, Lighting และ Brand Guard ใช้ Qwen ตัวเดียวกัน เพื่อสร้างแผน 3 ช็อตโดยยึดภาพสินค้าเป็นหลัก') }}</p>
            <div v-if="busy === 'draft'" class="creative-activity" role="status" aria-live="polite">
              <div class="activity-orbit" aria-hidden="true"><span>K</span></div>
              <div class="activity-copy">
                <small>{{ tr('Local Qwen · Creative Brain') }} · {{ draftElapsedSeconds }}s</small>
                <strong :key="draftActivityIndex" class="activity-line">{{ currentDraftActivity }}<span class="thinking-dots" aria-hidden="true" /></strong>
                <div class="activity-roles" aria-hidden="true">
                  <span v-for="(activity, index) in draftActivities" :key="activity" :class="{ done: index < draftActivityIndex, active: index === draftActivityIndex }" />
                </div>
                <p>{{ tr('ยังอยู่หน้านี้ได้ ระบบกำลังคิดและตรวจงานจริง') }}</p>
              </div>
            </div>
            <button v-else class="primary" type="button" :disabled="Boolean(busy)" @click="generateDraft">
              <span v-if="busy === 'draft'" class="spinner" />
              {{ busy === 'draft' ? tr('ทีม Creative กำลังวางแผน…') : tr('สร้างแผนและ Prompt →') }}
              <span aria-hidden="true">→</span>
            </button>
          </template>

          <template v-else-if="currentStep === 'export' && mission?.draft">
            <div class="section-number">04</div>
            <p class="section-label">{{ tr('Canonical Production Spec') }}</p>
            <h2>{{ tr('แผน 3 ช็อตและ Prompt พร้อมแล้ว') }}</h2>
            <section class="fidelity-card">
              <img v-if="productReference?.downloadUrl" :src="productReference.downloadUrl" :alt="tr('ภาพสินค้าต้นฉบับที่ต้องแนบไปกับ Prompt')">
              <div>
                <p class="section-label">{{ tr('Product Fidelity · สำคัญมาก') }}</p>
                <strong>{{ tr('ต้องแนบภาพนี้ไปพร้อม Prompt ทุกครั้ง') }}</strong>
                <p>{{ tr('อย่าใช้ Prompt เพียงอย่างเดียว ให้เลือก Image-to-Video และใช้ภาพนี้เป็น first frame หรือ product reference') }}</p>
                <a v-if="productReference?.downloadUrl" class="secondary reference-download" :href="productReference.downloadUrl" target="_blank" rel="noopener">{{ tr('ดาวน์โหลดภาพต้นฉบับ ↓') }}</a>
                <small>SHA-256: {{ productReference?.sha256?.slice(0, 16) }}…</small>
              </div>
            </section>
            <div class="caption-card">
              <p>{{ mission.draft.caption }}</p>
              <p>{{ mission.draft.cta }}</p>
              <p class="hashtags">{{ mission.draft.hashtags.join(' ') }}</p>
            </div>
            <div v-if="mission.draft.productionSpec?.shots?.length" class="creative-shot-grid">
              <article v-for="(shot, index) in mission.draft.productionSpec.shots" :key="index" class="creative-shot">
                <span>{{ tr('Shot {n}', { n: index + 1 }) }}</span>
                <strong>{{ shotSummary(shot) }}</strong>
              </article>
            </div>
            <div v-if="mission.draft.renderPrompts" class="prompt-grid">
              <article v-for="provider in (['veo', 'seedance'] as const)" :key="provider" class="prompt-card">
                <div><strong>{{ provider === 'veo' ? 'Veo' : 'Seedance' }}</strong><small>{{ mission.draft.renderPrompts[provider].adapterVersion }}</small></div>
                <textarea :value="mission.draft.renderPrompts[provider].prompt" rows="10" readonly />
                <small class="prompt-warning">{{ tr('⚠ แนบภาพสินค้าต้นฉบับด้านบนพร้อม Prompt นี้') }}</small>
                <button class="secondary" type="button" @click="copyProviderPrompt(provider)">{{ copiedPrompt === provider ? tr('✓ คัดลอกแล้ว') : tr('คัดลอก Prompt') }}</button>
              </article>
            </div>
            <section class="provider-generation" aria-labelledby="provider-generation-title">
              <p class="section-label">{{ tr('First Post · สร้างวิดีโอจริง') }}</p>
              <h3 id="provider-generation-title">{{ tr('สร้าง Local Preview บน DGX') }}</h3>
              <p>{{ tr('Wan จะใช้ภาพสินค้าต้นฉบับสร้างคลิปแนวตั้ง 5 วินาที โดยบีบแผน 3 ช็อตเป็น 3 จังหวะสำคัญ ไม่มีค่า API และปิดหน้านี้กลับมารับไฟล์ภายหลังได้') }}</p>
              <div class="provider-choice">
                <label :class="{ selected: localVideoEnabled, disabled: !localVideoEnabled }"><input v-model="selectedProvider" type="radio" value="wan" :disabled="videoGenerating || !localVideoEnabled"><strong>Wan2.2 Local Preview</strong><span>5 วินาที · 704 × 1280 · ไม่มีค่า API</span></label>
              </div>
              <p v-if="!localVideoEnabled" class="prompt-warning">{{ tr('Local Preview เปิดเฉพาะช่วงทดสอบที่มีผู้ดูแล จนกว่าระบบ Login และโควตาจะพร้อม') }}</p>
              <button v-if="!videoGenerating" class="primary full" type="button" :disabled="Boolean(busy) || !localVideoEnabled" @click="generateVideo">
                <span v-if="busy === 'generate-video'" class="spinner" />
                {{ busy === 'generate-video' ? tr('กำลังเข้าคิว…') : tr('สร้าง Local Preview →') }}
              </button>
              <div v-if="mission.videoGeneration" class="generation-progress" role="status" aria-live="polite">
                <div class="generation-heading"><strong>{{ mission.videoGeneration.provider === 'wan' ? 'Wan2.2 Local' : mission.videoGeneration.provider === 'veo' ? 'Veo 3.1' : 'Seedance' }}</strong><span>{{ generationStateLabel(mission.videoGeneration.state) }}</span></div>
                <div v-if="mission.videoGeneration.provider === 'wan' && videoGenerating" class="local-preview-activity">
                  <span class="spinner" />
                  <div><strong>{{ currentGenerationActivity }}</strong><p>{{ tr('เวลาประมาณการ') }}: {{ estimatedReadyLabel() }} · {{ tr('กลับมาหน้านี้ภายหลังได้ งานไม่หาย') }}</p></div>
                </div>
                <article v-for="(shot, index) in mission.videoGeneration.shots" :key="shot.shotId" class="generation-shot" :class="`generation-${shot.state}`">
                  <div><strong>{{ tr('Shot {n}', { n: index + 1 }) }}</strong><span>revision {{ shot.revision }} · {{ generationStateLabel(shot.state) }}</span></div>
                  <div v-if="shot.fidelity || shot.cinematic" class="generation-scores">
                    <span v-if="shot.fidelity">Product {{ percent(shot.fidelity.score) }} {{ shot.fidelity.passed ? '✓' : '!' }}</span>
                    <span v-if="shot.cinematic">Cinematic {{ percent(shot.cinematic.score) }} {{ shot.cinematic.passed ? '✓' : '!' }}</span>
                  </div>
                  <ul v-if="shot.defects?.length"><li v-for="defect in shot.defects" :key="defect.code">{{ defect.message }}</li></ul>
                </article>
                <p v-if="mission.videoGeneration.warning" class="prompt-warning">{{ mission.videoGeneration.warning }}</p>
                <button v-if="mission.videoGeneration.state === 'failed'" class="secondary" type="button" :disabled="Boolean(busy)" @click="generateVideo">{{ tr('ลองสร้างเฉพาะงานที่ค้างอีกครั้ง') }}</button>
                <small v-else-if="videoGenerating">{{ tr('ปิดหน้านี้ได้ งานอยู่ใน Mongo และทำต่อหลังระบบ restart') }}</small>
              </div>
            </section>
          </template>

          <template v-else-if="currentStep === 'post' && mission">
            <div class="section-number">06</div>
            <p class="section-label">{{ tr('โพสต์และบันทึกผล') }}</p>
            <h2 v-if="!mission.posted">{{ tr('พร้อมลองตลาดแล้ว') }}</h2>
            <h2 v-else>{{ tr('โพสต์แรกสำเร็จแล้ว 🎉') }}</h2>

            <section v-if="canPost && mission.videoGeneration && mission.videoGeneration.provider !== 'wan'" class="visual-qc qc-passed" aria-labelledby="generation-qc-title">
              <div class="visual-qc-heading"><div><span>{{ tr('Product Fidelity + Cinematic QC') }}</span><strong id="generation-qc-title">{{ tr('ผ่านครบก่อนรวมวิดีโอ') }}</strong></div><span class="qc-score">✓</span></div>
              <p>{{ tr('ภาพต้นฉบับถูกส่งทุกช็อต และทุกช็อตผ่าน VLM + OCR กับ ShotVL แล้ว') }}</p>
              <div class="generation-progress">
                <article v-for="(shot, index) in mission.videoGeneration.shots" :key="shot.shotId" class="generation-shot generation-succeeded">
                  <div><strong>{{ tr('Shot {n}', { n: index + 1 }) }}</strong><span>revision {{ shot.revision }}</span></div>
                  <div class="generation-scores"><span>Product {{ percent(shot.fidelity?.score) }} ✓</span><span>Cinematic {{ percent(shot.cinematic?.score) }} ✓</span></div>
                </article>
              </div>
            </section>

            <section v-else-if="canPost" class="visual-qc" :class="`qc-${visualQcState}`" aria-labelledby="visual-qc-title">
              <div class="visual-qc-heading">
                <div>
                  <span>{{ tr('Visual QC · คำแนะนำ') }}</span>
                  <strong id="visual-qc-title">{{ tr('ตรวจภาพและความต่อเนื่อง') }}</strong>
                </div>
                <span v-if="mission.visualQc?.latestReport" class="qc-score">{{ visualQcScore(mission.visualQc.latestReport.score) }}</span>
              </div>

              <p v-if="visualQcState === 'checking'">{{ tr('กำลังตรวจ keyframes แบบเบื้องหลัง คุณดาวน์โหลดและโพสต์ต่อได้เลย') }}</p>
              <p v-else-if="visualQcState === 'passed'">{{ tr('ไม่พบจุดที่ต้องระวังตามเกณฑ์ภาพยนตร์ของรอบนี้') }}</p>
              <p v-else-if="visualQcState === 'attention'">{{ tr('มีข้อสังเกตให้ตรวจด้วยตาอีกครั้งก่อนใช้จริง') }}</p>
              <p v-else-if="visualQcState === 'unavailable'">{{ mission.visualQc?.warning || 'ระบบตรวจภาพยังไม่พร้อมชั่วคราว' }}</p>
              <p v-else>{{ tr('ยังไม่มีผลตรวจภาพ คุณเริ่มตรวจเมื่อสะดวกหรือโพสต์ต่อได้') }}</p>

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
              <div v-if="canPost" class="action-row post-actions">
                <button class="secondary" type="button" @click="copyCaption">
                  {{ copied ? '✓ คัดลอกแล้ว' : 'คัดลอก Caption' }}
                </button>
                <button class="secondary" type="button" @click="openPlatform">เปิดแพลตฟอร์มที่เลือก ↗</button>
              </div>
              <div v-if="canPost" class="post-form">
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
.topbar-actions { display: flex; align-items: center; gap: 12px; }
.locale-picker { display: flex; align-items: center; gap: 7px; }
.locale-picker span { font-size: .72rem; }
.locale-picker select { width: auto; min-width: 94px; padding: 7px 28px 7px 10px; border-radius: 999px; background: rgba(255,255,255,.7); }
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
.creative-shot-grid, .prompt-grid { display: grid; gap: 14px; margin: 22px 0; }
.fidelity-card { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 20px; margin: 22px 0; padding: 18px; border: 2px solid #1f6b4f; border-radius: 18px; background: #f3faf5; }
.fidelity-card > img { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 12px; background: white; border: 1px solid #d4e3d8; }
.fidelity-card > div { display: grid; align-content: center; justify-items: start; gap: 9px; }
.fidelity-card strong { color: #173f32; font-size: 1.05rem; }
.fidelity-card p { margin: 0; color: #53625d; line-height: 1.6; }
.fidelity-card small { color: #78857f; overflow-wrap: anywhere; }
.reference-download { min-height: 42px; text-decoration: none; }
.creative-shot-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.creative-shot { display: grid; gap: 8px; padding: 16px; border: 1px solid #c8ddce; border-radius: 14px; background: #f4faf6; }
.creative-shot span { color: #1f6b4f; font-size: .75rem; font-weight: 700; }
.creative-shot strong { color: #35483f; font-size: .9rem; line-height: 1.5; }
.prompt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.prompt-card { display: grid; gap: 10px; padding: 16px; border: 1px solid #d5ddd7; border-radius: 15px; background: #fbfcfa; }
.prompt-card > div { display: flex; justify-content: space-between; gap: 10px; color: #173f32; }
.prompt-card small { color: #718079; }
.prompt-card .prompt-warning { color: #9a542f; font-weight: 700; line-height: 1.5; }
.prompt-card textarea { min-height: 220px; font: .78rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.phase-note { color: #68736f; font-size: .84rem; line-height: 1.65; }
.creative-activity { display: flex; align-items: center; gap: 20px; min-height: 150px; padding: 22px; border: 1px solid #b9d5c4; border-radius: 18px; background: linear-gradient(120deg, #f2faf5, #fffaf2, #f2faf5); background-size: 220% 220%; animation: activity-bg 5s ease infinite; overflow: hidden; }
.activity-orbit { position: relative; display: grid; place-items: center; flex: 0 0 72px; width: 72px; height: 72px; border: 1px solid #9fc9b0; border-radius: 50%; }
.activity-orbit::before, .activity-orbit::after { content: ''; position: absolute; border: 2px solid transparent; border-top-color: #1f6b4f; border-radius: 50%; animation: orbit 1.8s linear infinite; }
.activity-orbit::before { inset: -8px; }
.activity-orbit::after { inset: 8px; border-top-color: #e79757; animation-direction: reverse; animation-duration: 1.2s; }
.activity-orbit span { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px 12px 12px 3px; color: white; background: #1f6b4f; font-weight: 800; }
.activity-copy { display: grid; gap: 9px; min-width: 0; }
.activity-copy small { color: #6a7b73; font-weight: 700; }
.activity-copy strong { color: #173f32; line-height: 1.5; }
.activity-copy p { margin: 0; color: #68736f; font-size: .78rem; }
.activity-line { animation: activity-enter .55s ease both; }
.thinking-dots::after { content: ''; display: inline-block; width: 1.4em; animation: thinking 1.2s steps(4, end) infinite; }
.activity-roles { display: grid; grid-template-columns: repeat(7, minmax(12px, 1fr)); gap: 5px; max-width: 420px; }
.activity-roles span { height: 4px; border-radius: 999px; background: #d7dfda; transition: background .3s, transform .3s; }
.activity-roles span.done { background: #7db494; }
.activity-roles span.active { background: #1f6b4f; transform: scaleY(1.7); }
@keyframes activity-bg { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes orbit { to { transform: rotate(360deg); } }
@keyframes activity-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes thinking { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75%,100% { content: '...'; } }
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
.provider-generation { margin-top: 28px; padding: 24px; border: 1px solid #d9e4de; border-radius: 18px; background: linear-gradient(145deg, #f8fbf9, #eef7f1); }
.provider-generation h3 { margin: 4px 0 8px; }
.provider-choice { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 18px 0; }
.provider-choice label { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; padding: 16px; border: 1px solid #cad8d0; border-radius: 14px; background: white; cursor: pointer; }
.provider-choice label.selected { border-color: #1f6b4f; box-shadow: 0 0 0 2px #1f6b4f22; }
.provider-choice label span { grid-column: 2; color: #607068; font-size: .78rem; }
.local-preview-activity { display: flex; gap: 12px; align-items: flex-start; margin: 14px 0; padding: 14px; border-radius: 14px; background: #edf7f1; }
.local-preview-activity p { margin: 4px 0 0; color: #52635a; }
.generation-progress { display: grid; gap: 10px; margin-top: 18px; }
.generation-heading, .generation-shot > div { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.generation-heading { padding: 12px 14px; border-radius: 12px; background: #173f32; color: white; }
.generation-shot { padding: 14px; border: 1px solid #d9e4de; border-radius: 12px; background: white; }
.generation-shot span { color: #607068; font-size: .8rem; }
.generation-scores { justify-content: flex-start !important; margin-top: 8px; }
.generation-scores span { padding: 4px 8px; border-radius: 999px; background: #edf7ef; color: #173f32; }
.generation-shot ul { margin: 8px 0 0; padding-left: 20px; color: #9a3f32; font-size: .8rem; }
.generation-failed { border-color: #e4b6ae; }
@media (max-width: 640px) { .provider-choice { grid-template-columns: 1fr; } .generation-shot > div { align-items: flex-start; flex-direction: column; } }
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
  .creative-shot-grid, .prompt-grid { grid-template-columns: 1fr; }
  .fidelity-card { grid-template-columns: 1fr; }
  .fidelity-card > img { max-height: 280px; }
  .creative-activity { align-items: flex-start; gap: 14px; }
  .activity-orbit { flex-basis: 54px; width: 54px; height: 54px; }
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
