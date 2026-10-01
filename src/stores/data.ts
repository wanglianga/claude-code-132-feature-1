import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  Category, CheckInRecord, CounterpartChoiceKind, DB, Donation, EventPhase, Incident, IncidentType,
  Item, ItemProblem, ItemStatus, Match, MatchStatus, ProblemType, User,
} from '../types'
import { createSeedDB } from '../seed'
import { autoMatch, commonSlot, recommendFor, scorePair, uid } from '../utils'
import { CATEGORY_META } from '../meta'

const DB_KEY = 'swapmeet-db-v1'

/** 现场问题处置动作（仅社区工作人员可依据复核结论执行） */
export type ProblemAction =
  | 'continue'               // 复核通过，允许继续交换
  | 'free_exchange'          // 改为自由交换
  | 'wait'                   // 同意等待替代物品（保留预约）
  | 'cancel_arrived_keep'    // 取消：到场方保留时段改约 + 补偿摊位优先级
  | 'cancel_arrived_release' // 取消：到场方释放时段转自由交换
  | 'cancel_absent'          // 取消：双方均未到场，释放时段摊位
  | 'take_back'              // 复核不通过，问题物品带回
  | 'donate'                 // 社区决定转捐（校验授权与接收能力）
  | 'mediation'              // 转人工调解（维持冻结，不改结果）

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {
    /* 数据损坏时重新播种 */
  }
  const db = createSeedDB()
  localStorage.setItem(DB_KEY, JSON.stringify(db))
  return db
}

export interface ResolveEffects {
  itemStatus?: ItemStatus
  counterpartStatus?: ItemStatus
  matchStatus?: MatchStatus
}

export const useDataStore = defineStore('data', () => {
  const db = ref<DB>(loadDB())

  watch(db, (v) => localStorage.setItem(DB_KEY, JSON.stringify(v)), { deep: true })

  // ---------- 基础查询 ----------
  const event = computed(() => db.value.event)
  const users = computed(() => db.value.users)
  const items = computed(() => db.value.items)
  const matches = computed(() => db.value.matches)
  const incidents = computed(() => db.value.incidents)
  const donations = computed(() => db.value.donations)

  const userById = (id: string): User | undefined => db.value.users.find((u) => u.id === id)
  const itemById = (id: string): Item | undefined => db.value.items.find((i) => i.id === id)
  const itemByCode = (code: string): Item | undefined =>
    db.value.items.find((i) => i.code.toLowerCase() === code.trim().toLowerCase())
  const matchById = (id: string): Match | undefined => db.value.matches.find((m) => m.id === id)

  const itemsByParent = (pid: string) => db.value.items.filter((i) => i.parentId === pid)
  const pendingItems = computed(() => db.value.items.filter((i) => i.status === 'pending'))
  const approvedPool = computed(() => db.value.items.filter((i) => i.status === 'approved'))
  const freeZoneItems = computed(() => db.value.items.filter((i) => i.status === 'free_zone'))
  const reservedItems = computed(() => db.value.items.filter((i) => i.status === 'reserved'))
  const arrivedItems = computed(() => db.value.items.filter((i) => ['arrived', 'verified'].includes(i.status)))
  /** 被实物问题冻结的物品 */
  const frozenItems = computed(() => db.value.items.filter((i) => i.status === 'frozen'))

  const matchesForItem = (itemId: string) =>
    db.value.matches.filter((m) => m.itemAId === itemId || m.itemBId === itemId)
  const activeMatchForItem = (itemId: string) =>
    matchesForItem(itemId).find((m) => ['proposed', 'accepted_a', 'accepted_b', 'confirmed'].includes(m.status))

  const incidentsForItem = (itemId: string) => db.value.incidents.filter((i) => i.itemId === itemId)
  const openIncidents = computed(() => db.value.incidents.filter((i) => i.status !== 'resolved'))

  /** 家长可见的异常：本人物品上报的，或本人物品作为撮合另一方被卷入的（如对方物品冻结） */
  function incidentsForParent(userId: string) {
    return db.value.incidents.filter((inc) => {
      if (itemById(inc.itemId)?.parentId === userId) return true
      if (inc.matchId) {
        const m = matchById(inc.matchId)
        if (m) {
          const a = itemById(m.itemAId)
          const b = itemById(m.itemBId)
          return a?.parentId === userId || b?.parentId === userId
        }
      }
      return false
    })
  }

  /** 某家庭被现场退回（实物问题复核不通过）的次数 */
  function rejectionCount(parentId: string): number {
    return db.value.items.reduce(
      (n, it) =>
        n + (it.parentId === parentId ? (it.problems ?? []).filter((p) => p.staffVerdict && !p.staffVerdict.passed).length : 0),
      0,
    )
  }
  /** 多次（≥2）被退回的家庭：后续报名暂停自动撮合资格，需强化照片复核 */
  function isAutoMatchRestricted(parentId: string): boolean {
    const u = userById(parentId)
    return u?.autoMatchEligible === false || rejectionCount(parentId) >= 2
  }
  /** 再次报名是否必须走强化照片复核与缺件说明流程 */
  function needsEnhancedReview(item: Item): boolean {
    return isAutoMatchRestricted(item.parentId) || !!item.enhancedReview
  }

  /** 已占用摊位 = 已确认/冻结组合的摊位 ∪ 物品身上已分配的摊位（含冻结、未到场保留摊位） */
  const boothUsed = computed(() => {
    const used = new Set<string>()
    for (const m of db.value.matches) {
      if (['confirmed', 'frozen'].includes(m.status) && m.booth) used.add(m.booth)
    }
    for (const i of db.value.items) {
      if (i.booth && ['reserved', 'no_show', 'arrived', 'verified', 'exchanged', 'disputed', 'frozen'].includes(i.status)) {
        used.add(i.booth)
      }
    }
    return used.size
  })

  function pushHistory(item: Item, actor: string, action: string, detail?: string) {
    item.history.push({ at: Date.now(), actor, action, detail })
  }

  // ---------- 报名与审核 ----------
  function submitItem(payload: Omit<Item, 'id' | 'code' | 'status' | 'history' | 'createdAt'>, actor: string): Item {
    const item: Item = {
      ...payload,
      id: uid('itm'),
      code: `SW-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'pending',
      history: [],
      createdAt: Date.now(),
    }
    pushHistory(item, actor, '提交报名', '填写物品信息并提交审核')
    db.value.items.unshift(item)
    return item
  }

  function reviewItem(id: string, result: 'approved' | 'rejected', by: string, reason?: string) {
    const item = itemById(id)
    if (!item || item.status !== 'pending') return
    item.review = { by, at: Date.now(), result, reason }
    item.status = result
    pushHistory(item, by, result === 'approved' ? '审核通过' : '审核驳回', reason)
  }

  // ---------- 撮合 ----------
  function createMatch(a: Item, b: Item, actor: string): Match | null {
    const { score, reasons } = scorePair(a, b)
    const match: Match = {
      id: uid('m'), itemAId: a.id, itemBId: b.id, score, reasons,
      status: 'proposed', createdAt: Date.now(),
    }
    db.value.matches.unshift(match)
    for (const it of [a, b]) {
      it.status = 'matched'
      pushHistory(it, actor, '发起撮合', `与「${it.id === a.id ? b.name : a.name}」配对，待双方确认`)
    }
    return match
  }

  /** 一键智能撮合：返回生成的组合数（多次被退回、暂停自动撮合资格的家庭不参与） */
  function runAutoMatch(actor: string): number {
    const pool = approvedPool.value.filter((i) => !isAutoMatchRestricted(i.parentId))
    const skipped = approvedPool.value.length - pool.length
    const pairs = autoMatch(pool, db.value.event.boothCapacity, boothUsed.value)
    for (const p of pairs) createMatch(p.a, p.b, actor)
    if (skipped > 0) {
      for (const it of approvedPool.value.filter((i) => isAutoMatchRestricted(i.parentId))) {
        pushHistory(it, '系统', '跳过自动撮合', '该家庭处于强化复核期，物品不参与本轮自动撮合（可由社区手动安排或现场自由交换）')
      }
    }
    return pairs.length
  }

  /** 家长从推荐列表发起撮合 */
  function proposeFromRecommendation(itemId: string, targetId: string, actor: string): boolean {
    const a = itemById(itemId)
    const b = itemById(targetId)
    if (!a || !b || a.status !== 'approved' || b.status !== 'approved') return false
    createMatch(a, b, actor)
    return true
  }

  function recommendationsFor(itemId: string) {
    const item = itemById(itemId)
    if (!item) return []
    // 强化复核期家庭的物品不进入智能推荐（自动撮合），仅支持社区手动安排
    const pool = approvedPool.value.filter((i) => !isAutoMatchRestricted(i.parentId))
    return recommendFor(item, pool)
  }

  /** 家长确认/拒绝撮合 */
  function respondMatch(matchId: string, userId: string, accept: boolean, actor: string) {
    const match = matchById(matchId)
    if (!match) return
    const a = itemById(match.itemAId)
    const b = itemById(match.itemBId)
    if (!a || !b) return
    const isA = a.parentId === userId
    const isB = b.parentId === userId
    if (!isA && !isB) return

    if (!accept) {
      match.status = 'declined'
      for (const it of [a, b]) {
        it.status = 'approved'
        pushHistory(it, actor, '拒绝撮合', '组合解除，物品回到待撮合池')
      }
      return
    }

    if (isA) match.status = match.status === 'accepted_b' ? 'confirmed' : 'accepted_a'
    if (isB) match.status = match.status === 'accepted_a' ? 'confirmed' : 'accepted_b'
    pushHistory(isA ? a : b, actor, '接受撮合', match.status === 'confirmed' ? '双方均已确认' : '等待对方确认')

    if (match.status === 'confirmed') {
      const boothNo = boothUsed.value + 1
      match.booth = `B-${String(boothNo).padStart(2, '0')}`
      match.entryTime = commonSlot(a, b, db.value.event.timeSlots)
      for (const it of [a, b]) {
        it.status = 'reserved'
        it.booth = match.booth
        it.entryTime = match.entryTime
        pushHistory(it, '系统', '预约成功', `摊位 ${match.booth}，入场时段 ${match.entryTime}`)
      }
    }
  }

  /** 未匹配物品进入自由交换区 */
  function moveUnmatchedToFreeZone(actor: string): number {
    let n = 0
    for (const it of db.value.items.filter((i) => i.status === 'approved')) {
      it.status = 'free_zone'
      pushHistory(it, actor, '转入自由交换区', '本轮未匹配成功')
      n += 1
    }
    return n
  }

  // ---------- 实物不符：冻结与撮合回滚 ----------

  /** 物品是否已到场（有核销通过记录） */
  function isOnsite(item: Item): boolean {
    return !!item.checkIn?.passed || ['arrived', 'verified', 'exchanged'].includes(item.status)
  }

  /**
   * 志愿者在核销页拍照标记实物问题：
   * 冻结该物品及其关联撮合，已生成的取物凭证同步失效，生成异常交社区处置。
   */
  function flagItemProblem(
    itemId: string,
    payload: { type: ProblemType; photos: string[]; missingParts?: string; note?: string },
    actor: string,
  ): Incident | null {
    const item = itemById(itemId)
    if (!item) return null
    const problem: ItemProblem = {
      at: Date.now(), by: actor, type: payload.type,
      photos: payload.photos.length ? payload.photos : ['📷'],
      missingParts: payload.missingParts?.trim() || undefined,
      note: payload.note?.trim() || undefined,
    }
    item.problems = [...(item.problems ?? []), problem]
    item.status = 'frozen'
    pushHistory(item, actor, '标记实物问题', problemLabel(problem))

    const match = activeMatchForItem(itemId)
    if (match) {
      match.status = 'frozen'
      match.problemItemId = itemId
      const otherId = match.itemAId === itemId ? match.itemBId : match.itemAId
      const other = itemById(otherId)
      if (other) {
        pushHistory(other, '系统', '撮合冻结', `对方物品「${item.name}」被标记实物问题，请在争议协调页选择处置方式`)
      }
    }
    const typeLabel = { missing_parts: '缺少关键零件', photo_differs: '与报名照片差异较大', sanitation: '消毒状态无法确认' }[payload.type]
    return reportIncident({
      itemId,
      matchId: match?.id,
      type: 'item_problem',
      title: `「${item.name}」${typeLabel}，撮合已冻结`,
      message:
        `${typeLabel}。${payload.missingParts ? `缺件说明：${payload.missingParts}。` : ''}` +
        `${payload.note ? payload.note + '。' : ''}物品、关联撮合与取物凭证已冻结，请社区现场复核并协调原撮合对象选择。`,
      by: actor, role: 'volunteer', changeItemStatus: false,
    })
  }

  function problemLabel(p: ItemProblem): string {
    const base = { missing_parts: '缺少关键零件', photo_differs: '与报名照片差异较大', sanitation: '消毒状态无法确认' }[p.type]
    return p.missingParts ? `${base}：${p.missingParts}` : base
  }

  /** 社区现场复核：对照原始描述给出复核结论 */
  function reviewProblem(incidentId: string, passed: boolean, actor: string, note?: string) {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc || (inc.type !== 'item_problem' && inc.type !== 'mediation')) return
    const item = itemById(inc.itemId)
    if (!item || !item.problems?.length) return
    const last = item.problems[item.problems.length - 1]
    last.staffVerdict = { by: actor, at: Date.now(), passed, note: note?.trim() || undefined }
    inc.status = 'processing'
    inc.logs.push({
      at: Date.now(), actor, role: 'staff',
      message: `【现场复核】对照原始描述与报名照片，复核${passed ? '通过：问题可接受，允许继续交换流程' : '不通过：实物问题成立，按回滚流程处置'}${note ? `。${note}` : ''}`,
    })
    pushHistory(item, actor, passed ? '复核通过' : '复核不通过', note?.trim() || problemLabel(last))
  }

  /**
   * 原撮合对象（未被冻结一方）在四个选项中作出选择。
   * 家长的选择只是意向，最终结果由社区依据现场复核执行，任何一方不能单方面改写交换结果。
   */
  function counterpartChoose(matchId: string, userId: string, kind: CounterpartChoiceKind, actor: string, note?: string): boolean {
    const match = matchById(matchId)
    if (!match || match.status !== 'frozen' || !match.problemItemId) return false
    const chooserId = match.itemAId === match.problemItemId ? match.itemBId : match.itemAId
    const chooser = itemById(chooserId)
    if (!chooser || chooser.parentId !== userId) return false
    match.counterpartDecision = { kind, by: actor, at: Date.now(), note: note?.trim() || undefined }
    pushHistory(chooser, actor, '选择处置方式', choiceLabel(kind))
    const inc = db.value.incidents.find((i) => i.matchId === match.id && i.type === 'item_problem' && i.status !== 'resolved')
    if (inc) {
      inc.logs.push({ at: Date.now(), actor, role: 'parent', message: `原撮合对象选择「${choiceLabel(kind)}」，等待社区依据现场复核确认并执行。` })
      inc.status = 'processing'
    }
    return true
  }

  function choiceLabel(kind: CounterpartChoiceKind): string {
    return { continue: '继续交换', free_exchange: '改为自由交换', wait: '等待替代物品', cancel: '取消' }[kind]
  }

  /** 释放物品上的预约时段与摊位（凭证失效） */
  function releaseReservation(item: Item) {
    item.booth = undefined
    item.entryTime = undefined
  }

  /**
   * 社区依据现场复核与原撮合对象的选择执行处置（冻结回滚的唯一出口）。
   * 按双方实际到场情况分别释放或保留预约时段与摊位；问题物品不会再次进入自动撮合。
   */
  function resolveProblem(
    incidentId: string,
    action: ProblemAction,
    actor: string,
    resolution: string,
  ): { ok: boolean; error?: string } {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc || (inc.type !== 'item_problem' && inc.type !== 'mediation')) return { ok: false, error: '未找到对应的实物问题事件' }
    const problemItem = itemById(inc.itemId)
    if (!problemItem || problemItem.status !== 'frozen') return { ok: false, error: '问题物品不在冻结状态' }
    const match = inc.matchId ? matchById(inc.matchId) : undefined
    const other = match && match.problemItemId
      ? itemById(match.itemAId === match.problemItemId ? match.itemBId : match.itemAId)
      : undefined
    const lastVerdict = problemItem.problems?.[problemItem.problems.length - 1]?.staffVerdict

    // 「继续交换」必须有复核通过结论，且原撮合对象明确选择继续
    if (action === 'continue') {
      if (!lastVerdict?.passed) return { ok: false, error: '需先完成现场复核且复核通过，才允许继续交换' }
      if (match?.counterpartDecision?.kind !== 'continue') return { ok: false, error: '需原撮合对象选择「继续交换」' }
      problemItem.status = 'verified'
      problemItem.checkIn = {
        at: Date.now(), by: actor, photoMatch: true, damage: 'minor',
        disinfectedConfirmed: true, note: `带问题继续交换：${resolution}`, passed: true,
      }
      if (other && other.status === 'frozen') other.status = 'verified'
      if (match) match.status = 'confirmed'
      pushHistory(problemItem, actor, '继续交换', resolution)
      if (other) pushHistory(other, actor, '关联处理', `对方物品复核通过，按现状继续交换：${resolution}`)
      finishProblemIncident(inc, actor, resolution)
      return { ok: true }
    }

    if (action === 'mediation') {
      inc.type = 'mediation'
      inc.status = 'processing'
      inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【转人工调解】${resolution}（维持冻结，调解期间任何一方不得单独改写交换结果）` })
      pushHistory(problemItem, actor, '转人工调解', resolution)
      if (other) pushHistory(other, actor, '转人工调解', '双方价值/实物争议升级为人工调解，预约暂时保留')
      return { ok: true }
    }

    if (action === 'donate') {
      const r = communityDonate(problemItem, actor, resolution)
      if (!r.ok) return r
      if (other) handleCounterpartOnRollback(other!, match ?? null, actor, 'free_exchange', resolution)
      if (match) match.status = 'failed'
      finishProblemIncident(inc, actor, resolution)
      return { ok: true }
    }

    if (action === 'take_back') {
      problemItem.status = 'taken_back'
      releaseReservation(problemItem)
      pushHistory(problemItem, actor, '复核不通过带回', resolution)
      applyFamilyRestriction(problemItem, actor)
      if (other) handleCounterpartOnRollback(other!, match ?? null, actor, 'free_exchange', resolution)
      if (match) match.status = 'failed'
      finishProblemIncident(inc, actor, resolution)
      return { ok: true }
    }

    if (action === 'free_exchange') {
      // 复核不通过的问题物品不得再次进入交换（含自由交换区），须带回或转捐
      if (lastVerdict && !lastVerdict.passed) {
        return { ok: false, error: '该物品复核不通过，不能进入自由交换区；请选择「带回」「转捐」或「转人工调解」' }
      }
      problemItem.status = 'free_zone'
      releaseReservation(problemItem)
      pushHistory(problemItem, actor, '转自由交换区', resolution)
      if (other) {
        // 对方未到场：同样释放；已到场：转自由交换区但摊位释放
        other.status = 'free_zone'
        releaseReservation(other)
        pushHistory(other, actor, '转自由交换区', `对方物品问题经复核可接受，组合解除：${resolution}`)
      }
      if (match) match.status = 'failed'
      finishProblemIncident(inc, actor, resolution)
      return { ok: true }
    }

    if (action === 'wait') {
      // 保留预约时段与摊位，等待社区协调替代物品；问题物品保持冻结占位
      pushHistory(problemItem, actor, '等待替代物品', resolution)
      if (other) pushHistory(other, actor, '保留预约', `等待社区协调替代物品：${resolution}`)
      inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【等待替代物品】保留摊位 ${match?.booth} 与时段 ${match?.entryTime}，由社区协调替代物品。${resolution}` })
      inc.status = 'processing'
      return { ok: true }
    }

    if (action === 'cancel_arrived_keep' || action === 'cancel_arrived_release' || action === 'cancel_absent') {
      const otherOnsite = other ? isOnsite(other) : false
      if (action === 'cancel_arrived_keep') {
        if (!otherOnsite) return { ok: false, error: '对方未实际到场，不能按「到场保留时段」处理' }
        if (other) {
          other.status = 'arrived' // 已到场并保留预约资格，等待社区改约/匹配替代物品
          const u = userById(other.parentId)
          if (u) u.boothPriority = (u.boothPriority ?? 0) + 1
          pushHistory(other, actor, '改约保留 + 补偿', `对方取消，保留入场时段并补偿摊位优先级（现 ${u?.boothPriority ?? 1} 级）：${resolution}`)
        }
        problemItem.status = 'taken_back'
        releaseReservation(problemItem)
        applyFamilyRestriction(problemItem, actor)
        pushHistory(problemItem, actor, '取消并带回', resolution)
      } else if (action === 'cancel_arrived_release') {
        if (!otherOnsite) return { ok: false, error: '对方未实际到场，请使用「双方未到场释放」' }
        if (other) {
          other.status = 'free_zone'
          releaseReservation(other)
          pushHistory(other, actor, '取消转自由交换', `对方已到场但选择释放时段：${resolution}`)
        }
        problemItem.status = 'taken_back'
        releaseReservation(problemItem)
        applyFamilyRestriction(problemItem, actor)
        pushHistory(problemItem, actor, '取消并带回', resolution)
      } else {
        // 双方均未到场：各自释放时段摊位；问题物品带回且不再撮合
        problemItem.status = 'taken_back'
        releaseReservation(problemItem)
        applyFamilyRestriction(problemItem, actor)
        pushHistory(problemItem, actor, '取消并带回', resolution)
        if (other) {
          other.status = 'approved'
          releaseReservation(other)
          pushHistory(other, actor, '组合取消', `双方均未到场，时段摊位已释放，回到待撮合池：${resolution}`)
        }
      }
      if (match) {
        match.status = 'failed'
        match.booth = undefined
        match.entryTime = undefined
      }
      finishProblemIncident(inc, actor, resolution)
      return { ok: true }
    }

    return { ok: false, error: '不支持的处置动作' }
  }

  /** 回滚时处理未被冻结一方（按其选择与到场情况） */
  function handleCounterpartOnRollback(other: Item, match: Match | null, actor: string, fallback: CounterpartChoiceKind, resolution: string) {
    const choice = match?.counterpartDecision?.kind ?? fallback
    if (choice === 'wait') {
      other.status = isOnsite(other) ? 'arrived' : 'reserved'
      pushHistory(other, actor, '保留预约等待替代', `摊位 ${other.booth} 时段 ${other.entryTime} 保留：${resolution}`)
      return
    }
    other.status = 'free_zone'
    releaseReservation(other)
    pushHistory(other, actor, '转自由交换区', `问题组合解除：${resolution}`)
  }

  /** 社区决定转捐：必须同时校验家长捐赠授权与公益机构接收能力 */
  function communityDonate(item: Item, actor: string, resolution: string): { ok: boolean; error?: string } {
    if (!item.acceptDonation) {
      return { ok: false, error: '家长未授权公益捐赠（报名时未勾选或后续未补充授权），不能转捐' }
    }
    const charity = db.value.users.find((u) => u.role === 'charity')
    if (!charity) return { ok: false, error: '未配置公益接收机构' }
    if ((charity.capacity ?? 0) <= 0) {
      return { ok: false, error: `「${charity.orgName}」剩余接收能力为 0，请先扩容或协调其他机构` }
    }
    if (!db.value.donations.some((d) => d.itemId === item.id && d.status !== 'declined')) {
      db.value.donations.unshift({ id: uid('d'), itemId: item.id, charityId: charity.id, status: 'requested', createdAt: Date.now() })
    }
    const d = db.value.donations.find((x) => x.itemId === item.id && x.status === 'requested')
    if (d) respondDonation(d.id, true, charity.name ?? actor, resolution)
    releaseReservation(item)
    return { ok: true }
  }

  /** 家长在争议协调页补充捐赠授权（报名时未勾选，社区拟转捐前需要） */
  function grantDonationAuth(itemId: string, userId: string, actor: string): boolean {
    const item = itemById(itemId)
    if (!item || item.parentId !== userId) return false
    item.acceptDonation = true
    pushHistory(item, actor, '补充捐赠授权', '同意未换出时转赠合作公益机构')
    return true
  }

  /** 多次被退回 → 暂停该家庭后续报名的自动撮合资格 */
  function applyFamilyRestriction(item: Item, actor: string) {
    const parent = userById(item.parentId)
    if (!parent) return
    if (rejectionCount(item.parentId) >= 2 || (item.problems ?? []).filter((p) => p.staffVerdict && !p.staffVerdict.passed).length >= 2) {
      parent.autoMatchEligible = false
      pushHistory(item, actor, '强化复核', '该家庭物品多次现场退回，后续报名暂停自动撮合，须通过强化照片复核与缺件说明')
    }
  }

  /** 社区对再次报名物品执行强化照片复核（须附缺件说明核对） */
  function enhancedReviewItem(itemId: string, passed: boolean, actor: string, note?: string): boolean {
    const item = itemById(itemId)
    if (!item || item.status !== 'pending') return false
    item.enhancedReview = { by: actor, at: Date.now(), passed, note: note?.trim() || undefined }
    if (passed) {
      item.review = { by: actor, at: Date.now(), result: 'approved', reason: `强化照片复核通过：${note ?? '照片与缺件说明齐全'}` }
      item.status = 'approved'
      pushHistory(item, actor, '强化复核通过', note ?? '多角度照片与缺件说明核对无误')
    } else {
      item.review = { by: actor, at: Date.now(), result: 'rejected', reason: `强化照片复核不通过：${note ?? '请补充零件清单与实拍照片'}` }
      item.status = 'rejected'
      pushHistory(item, actor, '强化复核驳回', note ?? '照片/缺件说明不足')
    }
    return true
  }

  /** 社区为受限家庭恢复自动撮合资格（连续无问题后） */
  function restoreAutoMatchEligibility(parentId: string, actor: string) {
    const u = userById(parentId)
    if (!u) return
    u.autoMatchEligible = true
  }

  function finishProblemIncident(inc: Incident, actor: string, resolution: string) {
    inc.status = 'resolved'
    inc.resolution = resolution
    inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【处理结论】${resolution}` })
  }

  // ---------- 现场核销 ----------
  function checkIn(itemId: string, record: Omit<CheckInRecord, 'at'>, actor: string): Item | null {
    const item = itemById(itemId)
    if (!item) return null
    if (item.status === 'frozen') return null // 冻结物品须先经社区复核回滚，不能直接核销
    const rec: CheckInRecord = { ...record, at: Date.now() }
    item.checkIn = rec
    if (rec.passed) {
      item.status = 'verified'
      pushHistory(item, actor, '扫码核销', '物品到场，核验通过')
    } else {
      item.status = 'disputed'
      pushHistory(item, actor, '核销存疑', rec.note ?? '核验未通过，转入异常处理')
      reportIncident({
        itemId: item.id,
        type: 'photo_mismatch',
        title: `「${item.name}」核销异常`,
        message: rec.note ?? (!rec.photoMatch ? '实物与报名照片不符' : '现场核验未通过'),
        by: actor,
        role: 'volunteer',
        changeItemStatus: false,
      })
    }
    return item
  }

  /** 确认一组预约交换完成 */
  function confirmExchange(matchId: string, actor: string): boolean {
    const match = matchById(matchId)
    if (!match || match.status !== 'confirmed') return false
    const a = itemById(match.itemAId)
    const b = itemById(match.itemBId)
    if (!a || !b) return false
    if (a.status !== 'verified' || b.status !== 'verified') return false
    match.status = 'completed'
    for (const it of [a, b]) {
      it.status = 'exchanged'
      const other = it.id === a.id ? b : a
      pushHistory(it, actor, '交换成功', `与「${other.name}」完成交换`)
    }
    return true
  }

  /** 自由交换区现场登记交换 */
  function onsiteFreeExchange(aId: string, bId: string, actor: string): boolean {
    const a = itemById(aId)
    const b = itemById(bId)
    if (!a || !b || a.id === b.id) return false
    const ok = (s: ItemStatus) => ['verified', 'arrived', 'free_zone', 'no_exchange'].includes(s)
    if (!ok(a.status) || !ok(b.status)) return false
    const { score, reasons } = scorePair(a, b)
    const match: Match = {
      id: uid('m'), itemAId: a.id, itemBId: b.id, score, reasons,
      status: 'completed', onsite: true, createdAt: Date.now(),
    }
    db.value.matches.unshift(match)
    for (const it of [a, b]) {
      it.status = 'exchanged'
      const other = it.id === a.id ? b : a
      pushHistory(it, actor, '自由交换成功', `在自由交换区与「${other.name}」完成交换`)
    }
    return true
  }

  /** 预约物品未到场 */
  function markNoShow(itemId: string, actor: string) {
    const item = itemById(itemId)
    if (!item || !['reserved', 'matched'].includes(item.status)) return
    item.status = 'no_show'
    pushHistory(item, actor, '标记未到场', '超过入场时段未到')
    const match = activeMatchForItem(itemId)
    reportIncident({
      itemId, matchId: match && match.status === 'confirmed' ? match.id : undefined,
      type: 'no_show', title: `「${item.name}」家长临时缺席`,
      message: '超过预约入场时段仍未到场，请社区联系家长并处理配对物品。',
      by: actor, role: 'volunteer', changeItemStatus: false,
    })
  }

  /** 自由交换区/无人交换物品家长带回 */
  function takeBack(itemId: string, actor: string) {
    const item = itemById(itemId)
    if (!item) return
    item.status = 'taken_back'
    pushHistory(item, actor, '自行带回', '未换到心仪物品，选择带回')
  }

  // ---------- 异常 / 争议 ----------
  function reportIncident(payload: {
    itemId: string
    matchId?: string
    type: IncidentType
    title: string
    message: string
    by: string
    role: User['role']
    changeItemStatus?: boolean
  }): Incident {
    const incident: Incident = {
      id: uid('inc'),
      itemId: payload.itemId,
      matchId: payload.matchId,
      type: payload.type,
      title: payload.title,
      status: 'open',
      logs: [{ at: Date.now(), actor: payload.by, role: payload.role, message: payload.message }],
      createdBy: payload.by,
      createdAt: Date.now(),
    }
    db.value.incidents.unshift(incident)
    const item = itemById(payload.itemId)
    if (item && payload.changeItemStatus !== false && item.status !== 'disputed') {
      item.status = 'disputed'
      pushHistory(item, payload.by, '上报异常', payload.title)
    }
    return incident
  }

  function addIncidentLog(incidentId: string, actor: string, role: User['role'], message: string) {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc || !message.trim()) return
    inc.logs.push({ at: Date.now(), actor, role, message: message.trim() })
    if (inc.status === 'open') inc.status = 'processing'
    // 升级人工调解：冻结当前交换结果，双方物品进入争议态，调解一致办结后才恢复
    if (message.startsWith('【转人工调解】')) {
      const item = itemById(inc.itemId)
      const match = inc.matchId ? matchById(inc.matchId) : activeMatchForItem(inc.itemId)
      const pair = match ? [item, itemById(match.itemAId === inc.itemId ? match.itemBId : match.itemAId)] : [item]
      for (const it of pair) {
        if (it && ['verified', 'arrived', 'reserved'].includes(it.status)) {
          it.status = 'disputed'
          pushHistory(it, actor, '转人工调解', '交换结果暂时冻结，等待调解结论')
        }
      }
    }
  }

  function resolveIncident(incidentId: string, actor: string, resolution: string, effects: ResolveEffects) {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc) return
    inc.status = 'resolved'
    inc.resolution = resolution
    inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【处理结论】${resolution}` })

    const item = itemById(inc.itemId)
    if (item && effects.itemStatus) {
      item.status = effects.itemStatus
      pushHistory(item, actor, '争议处理完成', resolution)
    }
    const match = inc.matchId ? matchById(inc.matchId) : activeMatchForItem(inc.itemId)
    if (match && effects.matchStatus) match.status = effects.matchStatus
    if (match && effects.counterpartStatus) {
      const otherId = match.itemAId === inc.itemId ? match.itemBId : match.itemAId
      const other = itemById(otherId)
      if (other) {
        other.status = effects.counterpartStatus
        pushHistory(other, actor, '关联处理', `配对物品处理：${resolution}`)
      }
    }
  }

  // ---------- 捐赠 ----------
  function requestDonation(itemId: string, actor: string): Donation | null {
    const item = itemById(itemId)
    const charity = db.value.users.find((u) => u.role === 'charity')
    if (!item || !charity) return null
    if (db.value.donations.some((d) => d.itemId === itemId && d.status !== 'declined')) return null
    const donation: Donation = {
      id: uid('d'), itemId, charityId: charity.id, status: 'requested', createdAt: Date.now(),
    }
    db.value.donations.unshift(donation)
    pushHistory(item, actor, '申请公益转捐', `等待「${charity.orgName}」接收`)
    return donation
  }

  function respondDonation(donationId: string, accept: boolean, actor: string, note?: string) {
    const d = db.value.donations.find((x) => x.id === donationId)
    if (!d || d.status !== 'requested') return
    const item = itemById(d.itemId)
    const charity = userById(d.charityId)
    if (!item || !charity) return
    if (accept) {
      d.status = 'received'
      d.note = note
      item.status = 'donated'
      if (typeof charity.capacity === 'number') charity.capacity = Math.max(0, charity.capacity - 1)
      pushHistory(item, actor, '公益接收', `${charity.orgName} 接收${note ? `：${note}` : ''}`)
    } else {
      d.status = 'declined'
      d.note = note
      pushHistory(item, actor, '公益拒收', note ?? '接收能力不足')
      reportIncident({
        itemId: item.id, type: 'charity_capacity',
        title: `「${item.name}」公益接收能力不足`,
        message: `${charity.orgName} 因接收能力不足无法接收该物品，请社区协调其他去向。`,
        by: actor, role: 'charity', changeItemStatus: false,
      })
    }
  }

  // ---------- 活动阶段 ----------
  function setPhase(phase: EventPhase, actor: string) {
    db.value.event.phase = phase
    void actor
  }

  function resetAll() {
    db.value = createSeedDB()
  }

  // ---------- 活动总结统计 ----------
  const summary = computed(() => {
    const all = db.value.items
    const submittedCount = all.length
    const reviewed = all.filter((i) => i.review)
    const approvedCount = reviewed.filter((i) => i.review?.result === 'approved').length
    const arrived = all.filter((i) => i.checkIn)
    const exchanged = all.filter((i) => i.status === 'exchanged')
    const noShow = all.filter((i) => i.status === 'no_show')
    const donated = all.filter((i) => i.status === 'donated')
    const takenBack = all.filter((i) => i.status === 'taken_back')
    const noExchange = all.filter((i) => i.status === 'no_exchange')
    const frozen = all.filter((i) => i.status === 'frozen')
    /** 强化复核期家庭（暂停自动撮合资格） */
    const restrictedParents = db.value.users.filter(
      (u) => u.role === 'parent' && isAutoMatchRestricted(u.id),
    )
    /** 现场因实物问题退回的物品数 */
    const problemReturns = all.reduce(
      (n, it) => n + (it.problems ?? []).filter((p) => p.staffVerdict && !p.staffVerdict.passed).length,
      0,
    )

    // 品类供需缺口（仅统计可交换品类）
    const gap = (['toy', 'book', 'clothing', 'study', 'baby'] as Category[]).map((c) => {
      const supply = all.filter((i) => i.category === c && i.review?.result === 'approved').length
      const demand = all.filter((i) => i.desiredCategories.includes(c)).length
      return { category: c, label: CATEGORY_META[c].label, icon: CATEGORY_META[c].icon, supply, demand, gap: demand - supply }
    })

    // 预约到场率 = 实际到场（有核销记录）/ 曾经预约成功（含当前已预约、已到场、未到场）
    const everReserved = all.filter(
      (i) => i.status === 'reserved' || i.status === 'no_show' || i.checkIn,
    )
    const arrivalRate = everReserved.length ? Math.round((arrived.length / everReserved.length) * 100) : 0

    return {
      submittedCount,
      reviewedCount: reviewed.length,
      approvedCount,
      rejectedCount: reviewed.length - approvedCount,
      arrivedCount: arrived.length,
      exchangedCount: exchanged.length,
      successRate: arrived.length ? Math.round((exchanged.length / arrived.length) * 100) : 0,
      arrivalRate,
      noShow,
      donated,
      takenBack,
      noExchange,
      frozen,
      restrictedParents,
      problemReturns,
      gap,
    }
  })

  return {
    db, event, users, items, matches, incidents, donations,
    userById, itemById, itemByCode, matchById, itemsByParent,
    pendingItems, approvedPool, freeZoneItems, reservedItems, arrivedItems, frozenItems,
    matchesForItem, activeMatchForItem, incidentsForItem, incidentsForParent, openIncidents, boothUsed,
    rejectionCount, isAutoMatchRestricted, needsEnhancedReview,
    submitItem, reviewItem,
    runAutoMatch, proposeFromRecommendation, recommendationsFor, respondMatch, moveUnmatchedToFreeZone,
    checkIn, flagItemProblem, reviewProblem, counterpartChoose, resolveProblem,
    grantDonationAuth, enhancedReviewItem, restoreAutoMatchEligibility,
    confirmExchange, onsiteFreeExchange, markNoShow, takeBack,
    reportIncident, addIncidentLog, resolveIncident,
    requestDonation, respondDonation,
    setPhase, resetAll, summary,
  }
})
