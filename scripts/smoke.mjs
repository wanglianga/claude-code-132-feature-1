// 冒烟测试：esbuild 打 IIFE 包 → jsdom 执行 → 模拟各角色登录并遍历页面
import { JSDOM, VirtualConsole } from 'jsdom'
import { readFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../smoke-dist/app.iife.js', import.meta.url), 'utf8')

// 忽略 jsdom 未实现的 window.alert 等噪声
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (err) => {
  if (String(err.message || err).includes('Not implemented:')) return
  throw err
})

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost:5173/#/login',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
})
const { window } = dom
const { document } = window

window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }))
window.scrollTo = () => {}
window.alert = () => {}
window.confirm = () => true
window.prompt = () => ''
window.onerror = (msg) => { throw new Error(`window.onerror: ${msg}`) }

window.eval(bundle)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const fail = (name, why) => { results.push(`❌ ${name}: ${why}`); }
const pass = (name) => results.push(`✅ ${name}`)

function bodyText() {
  return document.body.textContent || ''
}
async function clickLogin(username) {
  const inputs = document.querySelectorAll('.login-card input.input')
  const [u, p] = inputs
  u.value = username
  u.dispatchEvent(new window.Event('input', { bubbles: true }))
  p.value = '123456'
  p.dispatchEvent(new window.Event('input', { bubbles: true }))
  const btn = [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('登 录'))
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(150)
}
async function logout() {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('退出登录'))
  if (btn) {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await sleep(120)
  }
}
async function goto(hash) {
  window.location.hash = hash
  await sleep(150)
}

await sleep(300)

// 1. 登录页渲染
if (bodyText().includes('亲子旧物交换平台') && bodyText().includes('测试账号')) pass('登录页渲染')
else fail('登录页渲染', '未找到预期文案')

// 2. 家长端
await clickLogin('parent1')
if (bodyText().includes('我的物品') && bodyText().includes('遥控赛车')) pass('家长登录+我的物品')
else fail('家长登录+我的物品', bodyText().slice(0, 120))

await goto('#/parent/submit')
if (bodyText().includes('报名新物品') && bodyText().includes('期望换取类型')) pass('家长-报名表单')
else fail('家长-报名表单', bodyText().slice(0, 120))

await goto('#/parent/matches')
if (bodyText().includes('撮合中心') && bodyText().includes('智能推荐')) pass('家长-撮合中心')
else fail('家长-撮合中心', bodyText().slice(0, 120))

await goto('#/parent/incidents')
if (bodyText().includes('争议协调')) pass('家长-争议协调')
else fail('家长-争议协调', bodyText().slice(0, 120))

// 3. 家长确认撮合（李敏的磁力片 m1 处于 proposed）——用 parent2 登录接受
await logout()
await clickLogin('parent2')
await goto('#/parent/matches')
const acceptBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('接受撮合'))
if (acceptBtn) {
  acceptBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(150)
  if (bodyText().includes('已接受，等待对方确认')) pass('家长-接受撮合')
  else fail('家长-接受撮合', '状态未变为等待对方确认')
} else fail('家长-接受撮合', '未找到接受按钮')
await logout()

// 3b. 原撮合对象（parent1 王晓）在争议协调页对冻结组合选择处置方式
await clickLogin('parent1')
await goto('#/parent/incidents')
if (bodyText().includes('对方物品被冻结') && bodyText().includes('缺少关键零件')) pass('家长-冻结事件与缺件说明可见')
else fail('家长-冻结事件与缺件说明可见', bodyText().slice(0, 200))
const waitBtn = [...document.querySelectorAll('.choice-btn')].find((b) => b.textContent.includes('等待替代物品'))
if (waitBtn) {
  waitBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(120)
  if (bodyText().includes('您已选择「等待替代物品」')) pass('家长-原撮合对象选择等待替代物品')
  else fail('家长-原撮合对象选择等待替代物品', bodyText().slice(0, 200))
} else fail('家长-原撮合对象选择等待替代物品', '未找到选择按钮')
await logout()

// 4. 社区工作人员端
await clickLogin('staff')
if (bodyText().includes('物品审核') && bodyText().includes('待审核')) pass('社区-审核队列')
else fail('社区-审核队列', bodyText().slice(0, 120))

// 审核驳回药品（精确定位「儿童感冒药」所在卡片）
const medRow = [...document.querySelectorAll('.review-row')].find((r) => r.textContent.includes('儿童感冒药'))
const medRejectBtn = medRow && [...medRow.querySelectorAll('button')].find((b) => b.textContent.includes('驳回'))
if (medRejectBtn) {
  medRejectBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(120)
  const chips = [...document.querySelectorAll('.modal .chip')]
  const med = chips.find((c) => c.textContent.includes('药品'))
  if (med) med.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(80)
  const confirmBtn = [...document.querySelectorAll('.modal button')].find((b) => b.textContent.includes('确认驳回'))
  confirmBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(150)
  if (bodyText().includes('药品类物品不参与交换')) pass('社区-驳回药品')
  else fail('社区-驳回药品', '未找到驳回原因文案')
} else fail('社区-驳回药品', '未找到药品物品或其驳回按钮')

await goto('#/staff/match')
if (bodyText().includes('撮合管理') && bodyText().includes('一键智能撮合')) pass('社区-撮合管理')
else fail('社区-撮合管理', bodyText().slice(0, 120))

// 执行智能撮合
const autoBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('一键智能撮合'))
autoBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
if (bodyText().includes('已生成') || bodyText().includes('没有满足条件')) pass('社区-智能撮合执行')
else fail('社区-智能撮合执行', bodyText().slice(0, 200))

await goto('#/staff/onsite')
if (bodyText().includes('现场总览') && bodyText().includes('自由交换区现场登记')) pass('社区-现场总览')
else fail('社区-现场总览', bodyText().slice(0, 120))

await goto('#/staff/incidents')
if (bodyText().includes('异常处置台') && bodyText().includes('价值争议')) pass('社区-异常处置台')
else fail('社区-异常处置台', bodyText().slice(0, 120))

await goto('#/staff/summary')
if (bodyText().includes('活动总结') && bodyText().includes('品类缺口') && bodyText().includes('未到场名单')) pass('社区-活动总结')
else fail('社区-活动总结', bodyText().slice(0, 120))

// 4b. 实物冻结复核与回滚（inc3：轨道火车套装，在「全部」标签下）
await goto('#/staff/incidents')
const allTab = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.includes('全部'))
allTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
const frozenCard = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('轨道火车套装缺少关键零件'))
if (frozenCard && frozenCard.textContent.includes('现场复核') && frozenCard.textContent.includes('缺件说明')) pass('社区-冻结复核面板渲染')
else fail('社区-冻结复核面板渲染', frozenCard ? frozenCard.textContent.slice(0, 200) : '未找到冻结事件卡片')

if (frozenCard) {
  // 对方（王晓）已到场核销、选择了等待；社区复核不通过后执行「问题物品带回」
  const reviewFailBtn = [...frozenCard.querySelectorAll('button')].find((b) => b.textContent.includes('复核不通过'))
  reviewFailBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(100)
  const select = frozenCard.querySelector('select')
  select.value = 'take_back'
  select.dispatchEvent(new window.Event('change', { bubbles: true }))
  await sleep(80)
  const resInput = [...frozenCard.querySelectorAll('input.input')].find((i) => (i.placeholder || '').includes('处理结论说明'))
  resInput.value = '缺件属实，问题物品由家长带回；对方保留预约等待替代物品'
  resInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  const applyBtn = [...frozenCard.querySelectorAll('button')].find((b) => b.textContent.includes('执行处置并办结'))
  applyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(150)
  if (frozenCard.textContent.includes('缺件属实，问题物品由家长带回')) pass('社区-冻结回滚办结')
  else fail('社区-冻结回滚办结', frozenCard.textContent.slice(-200))
}

// 4c. 强化照片复核：parent4 处于强化复核期，待审核物品必须走强化复核
await goto('#/staff/review')
const enhancedRow = [...document.querySelectorAll('.review-row')].find((r) => r.textContent.includes('电动机器人'))
if (enhancedRow && enhancedRow.textContent.includes('强化照片复核')) pass('社区-强化复核提示渲染')
else fail('社区-强化复核提示渲染', enhancedRow ? '缺少强化提示' : '未找到再次报名物品')
if (enhancedRow) {
  const openBtn = [...enhancedRow.querySelectorAll('button')].find((b) => b.textContent.includes('强化复核'))
  openBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(120)
  const modal = [...document.querySelectorAll('.modal')].find((m) => m.textContent.includes('强化照片复核'))
  if (modal) {
    for (const cb of modal.querySelectorAll('input[type=checkbox]')) {
      cb.checked = true
      cb.dispatchEvent(new window.Event('change', { bubbles: true }))
    }
    await sleep(80)
    const note = modal.querySelector('textarea.textarea')
    note.value = '多角度照片、零件清单、成色与消毒均核对无误'
    note.dispatchEvent(new window.Event('input', { bubbles: true }))
    const okBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent.includes('核对无误，通过'))
    okBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await sleep(150)
    if (!document.querySelector('.modal')) pass('社区-强化复核通过办结')
    else fail('社区-强化复核通过办结', '弹窗未关闭')
  } else fail('社区-强化复核通过办结', '未打开强化复核弹窗')
}
await logout()

// 5. 志愿者端：扫码核销
await clickLogin('volunteer')
if (bodyText().includes('扫码核销台')) pass('志愿者-核销台渲染')
else fail('志愿者-核销台渲染', bodyText().slice(0, 120))
const codeInput = document.querySelector('input.input')
codeInput.value = 'SW-1011'
codeInput.dispatchEvent(new window.Event('input', { bubbles: true }))
const verifyBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '核销')
verifyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
if (bodyText().includes('儿童平衡车') && bodyText().includes('实物与报名照片一致')) pass('志愿者-扫码找到物品')
else fail('志愿者-扫码找到物品', bodyText().slice(0, 200))
const submitBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('核验通过，完成核销'))
if (submitBtn) {
  submitBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(150)
  if (bodyText().includes('SW-1011') === false || bodyText().includes('已核销')) pass('志愿者-完成核销')
  else fail('志愿者-完成核销', bodyText().slice(0, 200))
} else fail('志愿者-完成核销', '未找到提交按钮')

// 5b. 志愿者对另一预约物品（SW-1012 点读笔套装）拍照标记缺件并冻结
const codeInput2 = document.querySelector('input.input')
codeInput2.value = 'SW-1012'
codeInput2.dispatchEvent(new window.Event('input', { bubbles: true }))
const verifyBtn2 = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '核销')
verifyBtn2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
const freezeToggle = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('拍照标记问题并冻结'))
freezeToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(100)
const partsArea = [...document.querySelectorAll('textarea.textarea')].find((t) => (t.placeholder || '').includes('遥控器'))
partsArea.value = '缺少点读笔充电线 1 根'
partsArea.dispatchEvent(new window.Event('input', { bubbles: true }))
const noteArea = [...document.querySelectorAll('textarea.textarea')].find((t) => (t.placeholder || '').includes('描述实物'))
noteArea.value = '现场发现套装缺少充电线，与报名照片不符'
noteArea.dispatchEvent(new window.Event('input', { bubbles: true }))
const confirmFreezeBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认冻结并生成异常单'))
confirmFreezeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
// 再次查询该物品，应处于冻结状态、禁止核销
const codeInput3 = document.querySelector('input.input')
codeInput3.value = 'SW-1012'
codeInput3.dispatchEvent(new window.Event('input', { bubbles: true }))
const verifyBtn3 = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '核销')
verifyBtn3.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
if (bodyText().includes('已因实物问题冻结') && bodyText().includes('问题冻结')) pass('志愿者-拍照标记问题并冻结')
else fail('志愿者-拍照标记问题并冻结', bodyText().slice(0, 200))
await logout()

// 6. 公益机构端
await clickLogin('charity')
if (bodyText().includes('捐赠接收') && bodyText().includes('木质拼图')) pass('公益-捐赠接收')
else fail('公益-捐赠接收', bodyText().slice(0, 120))
const acceptDonationBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认接收'))
if (acceptDonationBtn) {
  acceptDonationBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await sleep(150)
  if (bodyText().includes('本场已接收')) pass('公益-确认接收捐赠')
  else fail('公益-确认接收捐赠', bodyText().slice(0, 200))
} else fail('公益-确认接收捐赠', '未找到接收按钮')

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('❌'))
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
