// 冒烟测试：esbuild 打 IIFE 包 → jsdom 执行 → 模拟各角色登录并遍历页面
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../smoke-dist/app.iife.js', import.meta.url), 'utf8')

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost:5173/#/login',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const { window } = dom
const { document } = window

window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }))
window.scrollTo = window.scrollTo || (() => {})
window.alert = () => {}
window.confirm = () => true
window.prompt = () => '现场比对原始描述与问题照片，复核结论：情况属实'
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

// ===== 7. 现场实物不符：冻结 → 回滚选择 → 社区复核 → 资格联动 =====

// 7.1 志愿者核销 SW-1012 点读笔：勾选缺件+填写缺件说明后冻结（m2 配对的 SW-1011 已核销通过）
await logout()
await clickLogin('volunteer')
const codeInput2 = document.querySelector('input.input')
codeInput2.value = 'SW-1012'
codeInput2.dispatchEvent(new window.Event('input', { bubbles: true }))
;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '核销')
  .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
if (bodyText().includes('点读笔套装') && bodyText().includes('现场实物问题')) pass('志愿者-找到待冻结物品')
else fail('志愿者-找到待冻结物品', bodyText().slice(0, 200))

const flagChip = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.includes('缺少关键零件'))
flagChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(60)
const missingInput = document.querySelector('input[placeholder*="直轨"]')
missingInput.value = '缺少点读笔充电线与 1 本图册'
missingInput.dispatchEvent(new window.Event('input', { bubbles: true }))
await sleep(60)
const freezeBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('拍照标记问题并冻结'))
freezeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
if (bodyText().includes('冻结待处理') && bodyText().includes('点读笔套装')) pass('志愿者-拍照标记并冻结')
else fail('志愿者-拍照标记并冻结', bodyText().slice(0, 300))
await logout()

// 7.2 parent1（原撮合对象）在撮合中心选择【取消】
await clickLogin('parent1')
await goto('#/parent/matches')
if (bodyText().includes('撮合异常处理') && bodyText().includes('已冻结')) pass('家长-看到冻结组合')
else fail('家长-看到冻结组合', bodyText().slice(0, 300))
const rolloutCards = [...document.querySelectorAll('button.rollout-card')]
if (rolloutCards.length >= 4) {
  rolloutCards[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}
await sleep(60)
;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '确认选择')
  .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
if (bodyText().includes('异常交换处理结果') && bodyText().includes('您选择了【取消】')) pass('家长-回滚选择取消')
else fail('家长-回滚选择取消', bodyText().slice(0, 400))
await logout()

// 7.3 parent3（问题物品方）不能单方面改写，只能看到配合复核提示
await clickLogin('parent3')
await goto('#/parent/matches')
if (bodyText().includes('暂停自动撮合资格') && !bodyText().includes('确认选择')) pass('家长-问题方无法单方面改写+资格暂停提示')
else fail('家长-问题方无法单方面改写+资格暂停提示', bodyText().slice(0, 300))
await logout()

// 7.4 社区异常处置：未授权转捐被拦截 → 转人工调解并办结 → 确认实物不符退回
await clickLogin('staff')
await goto('#/staff/incidents')

// 7.4a 机器人（家长未授权捐赠）协调转捐应被拦截，物品保持冻结
const robotCard = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('可编程启蒙机器人现场实物不符'))
const donateBtn = [...robotCard.querySelectorAll('button')].find((b) => b.textContent.includes('协调转捐'))
donateBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
if (bodyText().includes('转捐校验未通过') && bodyText().includes('家长报名时未授权')) pass('社区-未授权转捐被拦截')
else fail('社区-未授权转捐被拦截', bodyText().slice(0, 400))

// 7.4b 价值争议转人工调解
const findCard = (kw) => [...document.querySelectorAll('.card')].find((c) => c.textContent.includes(kw))
let disputeCard = findCard('积木桌与英语分级读物的价值争议')
const medInput = disputeCard.querySelector('input[placeholder*="转人工调解说明"]')
medInput.value = '双方到场，依据原始描述与现场成色复核，转人工调解'
medInput.dispatchEvent(new window.Event('input', { bubbles: true }))
;[...disputeCard.querySelectorAll('button')].find((b) => b.textContent.includes('转人工调解'))
  .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
// 调解发起后事件进入「处理中」标签
const processingTab = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.includes('处理中'))
processingTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
disputeCard = findCard('积木桌与英语分级读物的价值争议')
if (disputeCard?.textContent.includes('人工调解进行中')) pass('社区-转人工调解')
else fail('社区-转人工调解', bodyText().slice(0, 300))
const medSelect = disputeCard.querySelector('select')
medSelect.value = '1'
medSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
await sleep(60)
disputeCard = findCard('积木桌与英语分级读物的价值争议')
const medConclusion = disputeCard.querySelector('input[placeholder*="处理结论"]')
medConclusion.value = '经调解双方不再交换，回自由交换区'
medConclusion.dispatchEvent(new window.Event('input', { bubbles: true }))
;[...disputeCard.querySelectorAll('button')].find((b) => b.textContent.includes('办结调解'))
  .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
const resolvedTab0 = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.includes('已解决'))
resolvedTab0.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
if (bodyText().includes('人工调解结论')) pass('社区-调解办结（禁止单方改写）')
else fail('社区-调解办结（禁止单方改写）', bodyText().slice(0, 400))

// 7.4c 机器人复核确认不符 → 退回家长（累计 2 次，强化复核）
const openTab = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.includes('待处理'))
openTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
const robotCard2 = findCard('可编程启蒙机器人现场实物不符')
const rejectBtn2 = [...robotCard2.querySelectorAll('button')].find((b) => b.textContent.includes('确认不符'))
rejectBtn2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(150)
await goto('#/staff/incidents')
const resolvedTab = [...document.querySelectorAll('button.chip')].find((b) => b.textContent.includes('已解决'))
resolvedTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await sleep(120)
if (bodyText().includes('退回家长带回')) pass('社区-复核确认不符并退回')
else fail('社区-复核确认不符并退回', bodyText().slice(0, 400))

// 7.5 撮合管理显示资格暂停家庭；审核队列显示强化照片复核
await goto('#/staff/match')
if (bodyText().includes('强化复核期') && bodyText().includes('冻结 / 回滚中的组合')) pass('社区-资格暂停与冻结组合展示')
else fail('社区-资格暂停与冻结组合展示', bodyText().slice(0, 300))
await goto('#/staff/review')
if (bodyText().includes('强化照片复核') && bodyText().includes('积木收纳箱')) pass('社区-强化照片复核队列')
else fail('社区-强化照片复核队列', bodyText().slice(0, 300))
await logout()

// ===== 输出 =====
console.log('\n' + results.join('\n'))
const failed = results.filter((r) => r.startsWith('❌'))
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
