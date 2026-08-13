// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MissionProgress from '../app/components/MissionProgress.vue'

describe('MissionProgress', () => {
  const items = [
    { label: 'เริ่มภารกิจแรก', complete: true, current: false },
    { label: 'ถ่ายครบ 3 ช็อต', complete: false, current: true },
    { label: 'ได้โพสต์ฉบับร่าง', complete: false, current: false },
    { label: 'เตรียมไฟล์พร้อมโพสต์', complete: false, current: false },
    { label: 'โพสต์ชิ้นแรก', complete: false, current: false },
  ]

  it('announces progress and the current beginner action', () => {
    const wrapper = mount(MissionProgress, { props: { items, posted: false } })
    expect(wrapper.attributes('aria-label')).toBe('ความคืบหน้าภารกิจ')
    expect(wrapper.text()).toContain('1/5')
    expect(wrapper.find('li.current').text()).toContain('ถ่ายครบ 3 ช็อต')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('lets a user abandon an active or legacy mission and start again', async () => {
    const wrapper = mount(MissionProgress, { props: { items, posted: false } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })
})
