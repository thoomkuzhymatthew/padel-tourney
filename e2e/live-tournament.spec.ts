import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function enterScore(page: Page, court: number, value: number) {
  const card = page.getByRole('region', { name: `Court ${court}`, exact: true })
  const edit = card.getByRole('button', { name: `Edit score for Court ${court}`, exact: true })
  if (await edit.count()) await edit.click()
  else await card.getByRole('button', { name: 'Enter score', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: `Team A ${value}`, exact: true }).click()
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toHaveCount(0)
}

test('two mobile sessions run, edit, reconnect and finish a live tournament', async ({ browser, baseURL }) => {
  test.setTimeout(120000)
  const options = { baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  const adminDevice = await browser.newContext(options)
  const playerDevice = await browser.newContext(options)
  const admin = await adminDevice.newPage()
  const player = await playerDevice.newPage()
  const pageErrors: string[] = []
  admin.on('pageerror', error => pageErrors.push(error.name))
  player.on('pageerror', error => pageErrors.push(error.name))
  let share = ''
  try {
    await admin.goto('/create')
    await admin.getByLabel('Tournament name').fill('Live courtside verification')
    await admin.getByRole('textbox', { name: 'Add a player' }).evaluate(input => {
      const data = new DataTransfer(); data.setData('text/plain','Alex,Blair,Casey,Devon,Ellis,Frankie,Georgie,Harper,Ivy')
      input.dispatchEvent(new ClipboardEvent('paste',{ clipboardData: data, bubbles: true, cancelable: true }))
    })
    const creation = admin.waitForResponse(response => response.url().includes('/rpc/create_tournament') && response.ok())
    await admin.getByRole('button', { name: 'Start', exact: true }).click()
    const credentials = (await (await creation).json())[0]
    share = credentials.share_id
    await admin.getByRole('link', { name: 'Open tournament' }).click()
    await player.goto(`/t/${share}`)
    await expect(admin.locator('.connection-line')).toContainText('Live', { timeout: 15000 })
    await expect(player.locator('.connection-line')).toContainText('Live', { timeout: 15000 })
    await expect(player.locator('.court-draw')).toHaveCount(2)
    await expect(admin.getByRole('button', { name: 'Start round 2', exact: true })).toBeDisabled()
    await expect(player.locator('.admin-bar')).toHaveCount(0)
    await expect(player.getByRole('button', { name: 'Tournament menu' })).toHaveCount(0)
    await admin.screenshot({path:'artifacts/admin-round-mobile.png',fullPage:true})
    await player.screenshot({path:'artifacts/player-round-mobile.png',fullPage:true})

    // Roster edits during an unscored round must not change its draw or names.
    await admin.getByRole('button', { name: 'Players', exact: true }).click()
    const roster = admin.getByRole('dialog')
    await roster.getByLabel('New player’s name').fill('Late joiner')
    await roster.getByRole('button', { name: 'Add player', exact: true }).click()
    await expect(roster.getByText('Joins from round 2', { exact: true })).toBeVisible()
    await roster.getByRole('button', { name: 'Rename Alex', exact: true }).click()
    await roster.getByRole('textbox', { name: 'Rename Alex', exact: true }).fill('Alex R')
    await roster.getByRole('button', { name: 'Save name' }).click()
    await expect(roster.getByText('Name changes from round 2', { exact: true })).toBeVisible()
    await roster.getByRole('button', { name: 'Remove Blair', exact: true }).click()
    await roster.getByRole('button', { name: 'Confirm removal' }).click()
    await expect(roster.getByText('Not in the next draw', { exact: true })).toBeVisible()
    await roster.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(player.locator('.draw-list')).not.toContainText('Alex R')
    await expect(player.locator('.draw-list')).not.toContainText('Late joiner')

    await player.getByRole('button', { name: 'Players', exact: true }).click()
    await player.getByRole('dialog').getByRole('button', { name: 'Rename Casey', exact: true }).click()
    await player.getByRole('dialog').getByRole('textbox', { name: 'Rename Casey', exact: true }).fill('Casey P')
    await player.getByRole('dialog').getByRole('button', { name: 'Save name' }).click()
    await expect(player.getByRole('dialog').getByText('Name changes from round 2', { exact: true })).toBeVisible()
    await player.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(admin.locator('.draw-list')).not.toContainText('Casey P')

    // A save in one session reaches the other through Realtime.
    const scoreStarted = Date.now()
    await enterScore(player, 1, 15)
    await expect(admin.getByRole('region', { name: 'Court 1', exact: true }).locator('.court-score')).toContainText('15', { timeout: 5000 })
    console.log(`Cross-session score reflected within ${Date.now() - scoreStarted}ms including sheet interaction.`)
    await expect(admin.getByRole('region', { name: 'Court 1', exact: true }).locator('.score-audit')).toContainText('Entered by player')
    await admin.getByRole('region', { name: 'Court 1', exact: true }).getByRole('button', { name: 'Edit score for Court 1' }).click()
    const staleSheet = admin.getByRole('dialog')
    await staleSheet.getByRole('button', { name: 'Team A 18', exact: true }).click()
    await enterScore(player, 1, 16)
    await expect(staleSheet.getByRole('alert')).toContainText('changed on another device')
    await expect(staleSheet.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await staleSheet.getByRole('button', { name: 'Review latest score' }).click()
    await expect(staleSheet.locator('.score-preview strong').first()).toHaveText('16')
    await staleSheet.getByRole('button', { name: 'Close', exact: true }).click()
    await enterScore(player, 2, 12)
    await expect(admin.getByRole('button', { name: 'Start round 2', exact: true })).toBeEnabled()

    await admin.getByLabel('Next round’s points').selectOption('21')
    await expect(admin.getByLabel('Next round’s points')).toHaveValue('21')
    await admin.getByRole('button', { name: 'Start round 2', exact: true }).click()
    await expect(player.locator('.round-subtitle')).toContainText('Round 2 · to 21 points')
    await expect(player.locator('.draw-list')).not.toContainText('Blair')
    await expect(player.locator('.draw-list').getByText('Alex', { exact: true })).toHaveCount(0)
    await player.getByRole('button', { name: 'Players', exact: true }).click()
    await expect(player.getByRole('dialog').getByText('Alex R', { exact: true })).toBeVisible()
    await expect(player.getByRole('dialog').getByRole('button', { name: 'Remove Alex R', exact: true })).toHaveCount(0)
    await player.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()

    // Both links can browse history, but the player gets no editing controls.
    await player.getByLabel('View round').selectOption('1')
    await expect(player.getByText('Past round. Scores are read-only.')).toBeVisible()
    await expect(player.locator('.draw-list button')).toHaveCount(0)
    await expect(player.locator('.court-score').first()).toContainText('16')
    await admin.getByLabel('View round').selectOption('1')
    await enterScore(admin,1,20)
    await expect(player.locator('.court-score').first()).toContainText('20')
    await player.getByRole('tab', { name: 'Leaderboard', exact: true }).click()
    await expect(player.locator('.leaderboard tbody tr')).toHaveCount(10)
    await expect(player.locator('.leaderboard .points-number').filter({hasText:/\.5$/}).first()).toBeVisible()
    await player.screenshot({path:'artifacts/leaderboard-mobile.png',fullPage:true})
    expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    // Reconnect restores a coherent current snapshot after an offline interval.
    await playerDevice.setOffline(true)
    await expect(player.locator('.connection-line')).toContainText('Reconnecting', { timeout: 15000 })
    await admin.getByLabel('View round').selectOption('2')
    await enterScore(admin,1,10)
    await playerDevice.setOffline(false)
    await expect(player.locator('.connection-line')).toContainText('Live', { timeout: 20000 })
    await player.getByRole('tab', { name: 'Round', exact: true }).click()
    await player.getByLabel('View round').selectOption('2')
    await expect(player.getByRole('region',{name:'Court 1',exact:true}).locator('.court-score')).toContainText('10')
    await player.getByRole('region',{name:'Court 2',exact:true}).getByRole('button',{name:'Enter score'}).click()
    await player.getByRole('dialog').getByRole('button',{name:'Team A 11',exact:true}).click()
    await player.screenshot({path:'artifacts/score-sheet-mobile.png',fullPage:true})
    await player.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()

    // Early advancement explicitly forfeits only the pending match.
    await admin.getByRole('button',{name:'Start early…'}).click()
    await expect(admin.getByRole('dialog')).toContainText('Court 2 has no score')
    await admin.getByRole('dialog').getByRole('button',{name:'Start round 3 with 0–0'}).click()
    await expect(player.locator('.round-subtitle')).toContainText('Round 3')
    await player.getByLabel('View round').selectOption('2')
    await expect(player.getByRole('region',{name:'Court 2',exact:true})).toContainText('counts as 0–0')
    await admin.getByLabel('View round').selectOption('2')
    await enterScore(admin,2,11)
    await expect(player.getByRole('region',{name:'Court 2',exact:true}).locator('.court-score')).toContainText('11')

    await admin.getByLabel('Tournament menu').click()
    await admin.getByRole('button',{name:'End tournament…',exact:true}).click()
    await admin.getByRole('dialog').getByRole('button',{name:'End tournament',exact:true}).click()
    await expect(admin.getByRole('heading',{name:'Final standings'})).toBeVisible()
    await expect(player.getByRole('heading',{name:'Final standings'})).toBeVisible()
    await expect(admin.locator('.admin-bar')).toHaveCount(0)
    await player.getByRole('tab',{name:'Round',exact:true}).click()
    await expect(player.locator('.draw-list button')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  } finally {
    await adminDevice.close(); await playerDevice.close()
    if (/^[a-f0-9]{48}$/.test(share)) {
      const temp=mkdtempSync(join(tmpdir(),'padel-live-cleanup-'))
      try {
        const file=join(temp,'cleanup.sql');writeFileSync(file,`delete from public.tournaments where share_id='${share}';`,{mode:0o600})
        const result=spawnSync('npx',['--yes','supabase','db','query','--remote','--yes','--file',file],{encoding:'utf8'})
        expect(result.status,'Live-test fixture must be removed').toBe(0)
      } finally {rmSync(temp,{recursive:true,force:true})}
    }
  }
})
