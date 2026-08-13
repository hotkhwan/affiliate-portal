import { describe, expect, it } from 'vitest'
import { detectLocale, translate } from '../app/i18n'

describe('KWANNI locale', () => {
  it('detects the three supported customer locales and defaults to Thai', () => {
    expect(detectLocale(['zh-CN', 'en-US'])).toBe('zh')
    expect(detectLocale('en-GB')).toBe('en')
    expect(detectLocale('th-TH')).toBe('th')
    expect(detectLocale('ja-JP')).toBe('th')
  })

  it('localizes the image-first Creative Brain journey', () => {
    expect(translate('th', 'ภาพสินค้า 1 ภาพ')).toBe('ภาพสินค้า 1 ภาพ')
    expect(translate('en', 'ภาพสินค้า 1 ภาพ')).toBe('One product image')
    expect(translate('zh', 'ภาพสินค้า 1 ภาพ')).toBe('一张商品图')
    expect(translate('zh', 'Shot {n}', { n: 3 })).toBe('镜头 3')
  })
})
