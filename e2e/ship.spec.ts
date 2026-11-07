import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TournamentData } from '../src/lib/tournament-api'

test('ship acceptance: eight players, share in under a minute, live scoring and protected admin actions', async ({browser,baseURL}) => {
  test.setTimeout(90000)
  const organiser=await browser.newContext({baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  const audience=await browser.newContext({baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  const admin=await organiser.newPage(),player=await audience.newPage()
  const consoleErrors:string[]=[],runtimeErrors:string[]=[]
  for(const page of [admin,player]){
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
    page.on('pageerror',error=>runtimeErrors.push(error.name))
  }
  let share='',snapshot:TournamentData|undefined,apiOrigin=''
  let headers:Record<string,string>={}
  admin.on('response',async response=>{
    if(response.url().includes('/rpc/get_tournament_snapshot')&&response.ok()){
      snapshot=await response.json();apiOrigin=new URL(response.url()).origin;headers=response.request().headers()
    }
  })
  try{
    const started=Date.now()
    await admin.goto('/')
    await admin.getByRole('link',{name:'Create tournament'}).click()
    await admin.getByLabel('Tournament name').fill('Ship acceptance fixture')
    await admin.getByRole('textbox',{name:'Add a player'}).evaluate(input=>{
      const data=new DataTransfer();data.setData('text/plain','Alex,Blair,Casey,Devon,Ellis,Frankie,Georgie,Harper')
      input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))
    })
    const created=admin.waitForResponse(response=>response.url().includes('/rpc/create_tournament')&&response.ok())
    await admin.getByRole('button',{name:'Start',exact:true}).click()
    share=(await(await created).json())[0].share_id
    const playerSection=admin.getByRole('region',{name:'Player link',exact:true})
    await expect(playerSection.getByRole('button',{name:'Copy link'})).toBeVisible()
    // Invoke native share through a controlled browser shim; no message is sent.
    await admin.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{
      if(!data.url||new URL(data.url).hash)throw new Error('Player share payload must exclude admin credentials')
    }}))
    await playerSection.getByRole('button',{name:'Share',exact:false}).click()
    await expect(playerSection.getByRole('status')).toHaveText('Share sheet opened')
    const creationMs=Date.now()-started
    expect(creationMs).toBeLessThan(60000)
    await admin.getByRole('link',{name:'Open tournament'}).click()
    await expect(admin.locator('.court-draw')).toHaveCount(2)
    await expect.poll(()=>Boolean(snapshot)).toBe(true)
    await player.goto(`/t/${share}`)
    await expect(player.locator('.connection-line')).toContainText('Live',{timeout:15000})
    await expect(admin.locator('.connection-line')).toContainText('Live',{timeout:15000})
    await player.getByRole('region',{name:'Court 1',exact:true}).getByRole('button',{name:'Enter score'}).click()
    await player.getByRole('dialog').getByRole('button',{name:'Team A 15',exact:true}).click()
    const saveStarted=Date.now()
    await player.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click()
    await expect(admin.getByRole('region',{name:'Court 1',exact:true}).locator('.court-score')).toContainText('15',{timeout:2000})
    const liveMs=Date.now()-saveStarted
    expect(liveMs).toBeLessThan(2000)
    const matchId=snapshot!.rounds[0].matches[0].id
    for(const token of [null,'invalid-token']){
      const actions:[string,Record<string,unknown>][]=[
        ['start_next_round',{p_target:24,p_round:{},p_confirm_unscored:true}],
        ['set_round_target',{p_target:21}],
        ['override_score',{p_match_id:matchId,p_score_a:12,p_score_b:12}],
        ['add_player',{p_name:'Unauthorised'}],
        ['remove_player',{p_player_id:snapshot!.players[0].id}],
        ['end_tournament',{}],
      ]
      for(const [name,args]of actions){
        const response=await organiser.request.post(`${apiOrigin}/rest/v1/rpc/${name}`,{headers,data:{p_share_id:share,p_admin_token:token,...args}})
        expect([401,403]).toContain(response.status())
        expect((await response.json()).code).toBe('42501')
      }
    }
    expect(runtimeErrors).toEqual([]);expect(consoleErrors).toEqual([])
    expect(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    console.log(JSON.stringify({creationAndShareMs:creationMs,crossDeviceScoreMs:liveMs,adminDenials:12,consoleErrors:0,runtimeErrors:0}))
  }finally{
    await organiser.close();await audience.close()
    if(/^[0-9a-f]{48}$/.test(share)){
      const temp=mkdtempSync(join(tmpdir(),'padel-ship-cleanup-'))
      try{
        const file=join(temp,'cleanup.sql');writeFileSync(file,`delete from public.tournaments where share_id='${share}';`,{mode:0o600})
        const result=spawnSync('npx',['--yes','supabase','db','query','--remote','--yes','--file',file],{encoding:'utf8'})
        expect(result.status,'Acceptance fixture must be removed').toBe(0)
      }finally{rmSync(temp,{recursive:true,force:true})}
    }
  }
})

test('share metadata and images are present in raw HTML on home and tournament routes',async({request})=>{
  for(const path of ['/',`/t/${'a'.repeat(48)}`]){
    const response=await request.get(path);expect(response.ok()).toBe(true)
    const html=await response.text()
    expect(html).toContain('<title>Padel Genie Americano')
    for(const tag of ['og:title','og:description','og:image','og:image:width','og:image:height','twitter:card'])expect(html).toContain(tag)
    expect(html).toContain('https://padel-tourney-5q8r.vercel.app/social-preview.png')
  }
  const image=await request.get('/social-preview.png');expect(image.ok()).toBe(true)
  expect(image.headers()['content-type']).toContain('image/png')
  const bytes=await image.body();expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(630)
  for(const icon of ['/favicon.svg','/favicon-32.png','/apple-touch-icon.png'])expect((await request.get(icon)).ok()).toBe(true)
})
