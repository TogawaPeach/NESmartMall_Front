import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import {
  formatFlashSaleCountdown,
  getFlashSaleStatus,
  parseFlashSaleTime,
} from '../src/utils/flashSaleTime.ts'

for (const separator of [' ', 'T']) {
  test(`timezone-less ${JSON.stringify(separator)} timestamps represent Beijing time and retain milliseconds`, () => {
    assert.equal(
      parseFlashSaleTime(`2026-10-22${separator}16:00:53.581`),
      Date.UTC(2026, 9, 22, 8, 0, 53, 581),
    )
    assert.equal(
      parseFlashSaleTime(`2026-10-30${separator}16:04:01`),
      Date.UTC(2026, 9, 30, 8, 4, 1),
    )
  })
}

test('explicit offsets and UTC retain their original instant', () => {
  const expected = Date.UTC(2026, 9, 22, 8, 0, 53, 581)
  for (const value of [
    '2026-10-22T16:00:53.581+08:00',
    '2026-10-22T08:00:53.581Z',
    '2026-10-22T04:00:53.581-04:00',
  ]) {
    assert.equal(parseFlashSaleTime(value), expected, value)
  }
})

test('invalid dates and malformed times remain invalid instead of rolling into another day', () => {
  for (const value of [
    null,
    1792656053581,
    '',
    '2026-10-22',
    '16:00:53',
    '2026-02-29 16:00:00',
    '2026-04-31T16:00:00',
    '2026-13-01 16:00:00',
    '2026-10-22 24:00:00',
    '2026-10-22 16:60:00',
    '2026-10-22 16:00:60',
    '2026-10-22T16:00:00+14:01',
    '2026-10-22T16:00:00+08',
  ]) {
    assert.equal(parseFlashSaleTime(value), null, String(value))
  }
  assert.equal(parseFlashSaleTime('2028-02-29 00:00:00.1'), Date.UTC(2028, 1, 28, 16, 0, 0, 100))
})

test('Beijing activity times drive status boundaries and the remaining countdown', () => {
  const window = {
    startsAtMs: parseFlashSaleTime('2026-10-22 16:00:53.581'),
    endsAtMs: parseFlashSaleTime('2026-10-30 16:04:01.000'),
  }
  assert.equal(getFlashSaleStatus(window, Date.UTC(2026, 9, 22, 8, 0, 53, 580)), 'upcoming')
  assert.equal(getFlashSaleStatus(window, Date.UTC(2026, 9, 22, 8, 0, 53, 581)), 'active')
  assert.equal(getFlashSaleStatus(window, Date.UTC(2026, 9, 30, 8, 4, 1)), 'ended')
  assert.equal(
    formatFlashSaleCountdown(window.endsAtMs - Date.UTC(2026, 9, 30, 8, 3, 1)),
    '00:01:00',
  )
})

test('the browser host timezone cannot shift a Beijing timestamp', () => {
  const moduleUrl = new URL('../src/utils/flashSaleTime.ts', import.meta.url).href
  for (const timezone of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { parseFlashSaleTime } from ${JSON.stringify(moduleUrl)};
         console.log(parseFlashSaleTime('2026-10-22T16:00:53.581'));`,
      ],
      { env: { ...process.env, TZ: timezone }, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(Number(result.stdout.trim()), Date.UTC(2026, 9, 22, 8, 0, 53, 581), timezone)
  }
})
