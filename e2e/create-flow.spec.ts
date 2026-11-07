import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const shares = new Set<string>()
async function pastePlayers(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Add a player' }).evaluate((input, names) => {
    const data = new DataTransfer()
    data.setData('text/plain', names)
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

test.beforeEach(async ({ page }) => {
  page.on('response', async response => {
    if (response.url().includes('/rpc/create_tournament') && response.ok()) {
      const rows = await response.json()
      if (/^[a-f0-9]{48}$/.test(rows?.[0]?.share_id)) shares.add(rows[0].share_id)
    }
  })
})

test.afterAll(() => {
  if (!shares.size) return
  const temp = mkdtempSync(join(tmpdir(), 'padel-ui-cleanup-'))
  try {
    const file = join(temp, 'cleanup.sql')
    writeFileSync(file, `delete from public.tournaments where share_id in (${[...shares].map(s => `'${s}'`).join(',')});`, { mode: 0o600 })
    const result = spawnSync('npx', ['--yes','supabase','db','query','--remote','--yes','--file',file], { encoding: 'utf8' })
    expect(result.status, 'Hosted UI fixtures must be removed').toBe(0)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('creates a real mobile tournament, shares links and resumes after refresh', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.name))
  await context.grantPermissions(['clipboard-read','clipboard-write'])
  await page.goto('/')
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true })
  await page.getByRole('link', { name: 'Create tournament' }).click()
  await page.getByLabel('Tournament name').fill('Saturday courtside')
  const draft = page.getByRole('textbox', { name: 'Add a player' })
  await draft.fill('Alex'); await draft.press('Enter')
  await draft.fill('Blair'); await draft.press('Enter')
  await pastePlayers(page, 'Casey\nDevon,Ellis\nFrankie')
  await expect(page.locator('.player-list input')).toHaveCount(6)
  await expect(page.getByText('6 players will use 1 court.', { exact: false })).toBeVisible()
  await page.getByRole('radio', { name: '21', exact: true }).check()
  await page.getByLabel('Player 2 name', { exact: true }).fill('Alex')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await expect(page.locator('#player-name-error')).toContainText('same name')
  await page.getByLabel('Player 2 name', { exact: true }).fill('Blair')
  await page.screenshot({ path: 'artifacts/create-mobile.png', fullPage: true })
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/rpc/create_tournament')) requests.push(request.method()) })
  await page.getByRole('button', { name: 'Start', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect(page.getByRole('heading', { name: 'Player link', exact: true })).toBeVisible()
  await expect(page.getByText('Saved on this device.', { exact: false })).toBeVisible()
  await expect(page.locator('.tournament-meta')).toContainText('21 points')
  expect(requests).toEqual(['POST'])
  await page.screenshot({ path: 'artifacts/links-mobile.png', fullPage: true })
  const playerSection = page.getByRole('region', { name: 'Player link', exact: true })
  await playerSection.getByRole('button', { name: 'Copy link' }).click()
  await expect(playerSection.getByRole('status')).toHaveText('Link copied')
  const playerUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(new URL(playerUrl).hash.length).toBe(0)
  expect(new URL(playerUrl).pathname.split('/').length).toBe(3)
  const adminSection = page.getByRole('region', { name: 'Admin link', exact: true })
  await adminSection.getByRole('button', { name: 'Copy link' }).click()
  const adminUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(new URL(adminUrl).pathname.endsWith('/admin')).toBe(true)
  expect(new URL(adminUrl).hash.length).toBe(65)
  await page.getByRole('link', { name: 'Open tournament' }).click()
  await expect(page.locator('.court-draw')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Sitting out' })).toBeVisible()
  expect(new URL(page.url()).pathname.endsWith('/admin')).toBe(true)
  expect(new URL(page.url()).hash.length).toBe(65)
  await page.getByRole('link', { name: 'Home', exact: false }).first().click()
  await page.getByRole('link', { name: 'Resume' }).click()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Open tournament' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Saturday courtside' })).toBeVisible()
  await expect(page.locator('.manual-copy')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('warns when storage fails and offers manual copying when clipboard is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'QuotaExceededError') }
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Unavailable') } }, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
  await page.route('**/rest/v1/rpc/get_tournament_snapshot', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.goto('/create')
  await pastePlayers(page, 'Alex,Blair,Casey,Devon')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('This browser couldn’t save your tournament.', { exact: false })).toBeVisible()
  const playerSection = page.getByRole('region', { name: 'Player link', exact: true })
  await playerSection.getByRole('button', { name: 'Share', exact: false }).click()
  await expect(playerSection.getByRole('textbox', { name: 'Player link' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open tournament' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Admin link' })).toBeVisible()
})

test('keeps the form after RPC failure and validates pasted duplicates and minimum players', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/rpc/create_tournament', async route => {
    requests++
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) })
  })
  await page.goto('/create')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('at least 4')
  await pastePlayers(page, 'Alex,alex')
  await expect(page.getByRole('alert')).toContainText('already in the list')
  await expect(page.locator('.player-list input')).toHaveCount(0)
  await pastePlayers(page, 'Alex,Blair,Casey,Devon')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm')
  await expect(page.locator('.player-list input')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
  expect(requests).toBe(1)
})

test('ignores corrupt saved data and renders usable desktop and not-found states', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('padel-genie.tournaments.v1', '[{"shareId":"bad","adminToken":"bad"}]'))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Create tournament' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Resume' })).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.goto('/does-not-exist')
  await expect(page.getByRole('heading', { name: 'Out of bounds.' })).toBeVisible()
})
