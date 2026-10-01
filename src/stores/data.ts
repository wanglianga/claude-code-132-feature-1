import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  Category, CheckInRecord, DB, Donation, EventPhase, Incident, IncidentType,
  Item, ItemStatus, Match, MatchStatus, ProblemFlag, RolloutChoice, User,
} from '../types'
import { createSeedDB } from '../seed'
import { autoMatch, commonSlot, recommendFor, scorePair, uid } from '../utils'
import { CATEGORY_META, PROBLEM_FLAG_META } from '../meta'

const DB_KEY = 'swapmeet-db-v2'

const PROBLEM_LABEL: Record<ProblemFlag, string> = {
  missing_parts: PROBLEM_FLAG_META.missing_parts.label,
  photo_mismatch: PROBLEM_FLAG_META.photo_mismatch.label,
  disinfection_unconfirmed: PROBLEM_FLAG_META.disinfection_unconfirmed.label,
}

/** 进行中的撮合状态（含冻结 / 等待替代） */
const ACTIVE_MATCH_STATUSES: MatchStatus[] = [
  'proposed', 'accepted_a', 'accepted_b', 'confirmed', 'frozen', 'waiting_replace',
]
/** 冻结后家长尚未做出回滚选择时，组合保持冻结 */
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
  /** 已预约待到场：不含处于冻结/回滚流程中的组合物品（它们在异常处置中处理） */
  const reservedItems = computed(() =>
    db.value.items.filter((i) => i.status === 'reserved' && !frozenMatchForItem(i.id)),
  )
  const arrivedItems = computed(() => db.value.items.filter((i) => ['arrived', 'verified'].includes(i.status)))

  const matchesForItem = (itemId: string) =>
    db.value.matches.filter((m) => m.itemAId === itemId || m.itemBId === itemId)
  const activeMatchForItem = (itemId: string) =>
    matchesForItem(itemId).find((m) => ACTIVE_MATCH_STATUSES.includes(m.status))
  /** 物品被冻结后对应的进行中撮合 */
  const frozenMatchForItem = (itemId: string) =>
    matchesForItem(itemId).find((m) => m.status === 'frozen' || m.status === 'waiting_replace')

  const incidentsForItem = (itemId: string) => db.value.incidents.filter((i) => i.itemId === itemId)
  const openIncidents = computed(() => db.value.incidents.filter((i) => i.status !== 'resolved'))

  const frozenItems = computed(() => db.value.items.filter((i) => i.status === 'frozen'))
  const waitingItems = computed(() => db.value.items.filter((i) => i.status === 'waiting_replace'))
  /** 需强化照片复核的待审核物品 */
  const intensiveReviewItems = computed(() =>
    db.value.items.filter((i) => i.status === 'pending' && i.intensiveReview),
  )
  /** 多次现场退回的物品 */
  const rejectedOnsiteItems = computed(() => db.value.items.filter((i) => (i.rejectCount ?? 0) > 0))

  /** 家庭是否处于自动撮合资格暂停期 */
  function familyAutoMatchBlocked(parentId: string): boolean {
    return userById(parentId)?.autoMatchBlocked === true
  }
  /** 公益转捐候选池：已到场核销、未成交、家长授权捐赠、无进行中（含冻结/等待替代）撮合的物品 */
  const donationCandidatePool = computed(() =>
    db.value.items.filter((i) => {
      if (!i.acceptDonation || !i.checkIn) return false
      if (!['free_zone', 'no_exchange', 'verified', 'arrived'].includes(i.status)) return false
      const m = activeMatchForItem(i.id)
      if (m) return false
      return true
    }),
  )

  /** 已占用摊位 = 已确认/冻结组合的摊位 ∪ 物品身上已分配的摊位。
   *  冻结复核期间摊位保留；家长选择自由交换/取消/等待替代后摊位即释放（booth 字段会清除）。 */
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
    // 被暂停自动撮合资格的家庭，后续报名强制进入强化照片复核 + 缺件说明流程
    const intensive = familyAutoMatchBlocked(payload.parentId)
    const item: Item = {
      ...payload,
      id: uid('itm'),
      code: `SW-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'pending',
      intensiveReview: intensive || payload.intensiveReview,
      history: [],
      createdAt: Date.now(),
    }
    pushHistory(item, actor, '提交报名', intensive ? '该家庭处于强化复核期，需多角度照片与缺件说明审核' : '填写物品信息并提交审核')
    db.value.items.unshift(item)
    return item
  }

  function reviewItem(id: string, result: 'approved' | 'rejected', by: string, reason?: string) {
    const item = itemById(id)
    if (!item || item.status !== 'pending') return
    item.review = { by, at: Date.now(), result, reason, intensive: !!item.intensiveReview }
    item.status = result
    if (result === 'approved') {
      pushHistory(item, by, '审核通过', item.intensiveReview ? '强化照片复核与缺件说明通过，恢复进入撮合池' : '物品符合现场交换要求')
      // 强化复核通过后，恢复该家庭自动撮合资格
      if (item.intensiveReview) {
        const parent = userById(item.parentId)
        if (parent?.autoMatchBlocked) {
          parent.autoMatchBlocked = false
          parent.autoMatchBlockReason = undefined
        }
        item.intensiveReview = false
      }
    } else {
      pushHistory(item, by, '审核驳回', reason)
    }
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

  /** 一键智能撮合：返回生成的组合数。多次现场退回被暂停资格的家庭不参与自动撮合。 */
  function runAutoMatch(actor: string): number {
    const pool = approvedPool.value.filter((i) => !familyAutoMatchBlocked(i.parentId))
    const pairs = autoMatch(pool, db.value.event.boothCapacity, boothUsed.value)
    for (const p of pairs) createMatch(p.a, p.b, actor)
    return pairs.length
  }

  /** 家长从推荐列表发起撮合（资格暂停期 / 强化复核期不能发起） */
  function proposeFromRecommendation(itemId: string, targetId: string, actor: string): boolean {
    const a = itemById(itemId)
    const b = itemById(targetId)
    if (!a || !b || a.status !== 'approved' || b.status !== 'approved') return false
    if (familyAutoMatchBlocked(a.parentId) || familyAutoMatchBlocked(b.parentId)) return false
    createMatch(a, b, actor)
    return true
  }

  function recommendationsFor(itemId: string) {
    const item = itemById(itemId)
    if (!item) return []
    return recommendFor(item, approvedPool.value)
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

  // ---------- 现场核销 ----------
  /**
   * 志愿者现场核销：
   * - 通过 → verified；
   * - 不通过且勾选了实物问题（缺件 / 与照片差异大 / 消毒无法确认）→ 冻结物品与其关联撮合，
   *   留存问题照片与缺件说明，生成「现场实物不符」异常，等待原撮合对象选择与社区复核。
   */
  function checkIn(itemId: string, record: Omit<CheckInRecord, 'at'>, actor: string): Item | null {
    const item = itemById(itemId)
    if (!item) return null
    const flags = (record.flags ?? []).filter(Boolean) as ProblemFlag[]
    const shouldFreeze = !record.passed && flags.length > 0
    const rec: CheckInRecord = {
      ...record,
      at: Date.now(),
      flags: shouldFreeze ? flags : record.flags,
      frozen: shouldFreeze,
    }
    item.checkIn = rec

    if (rec.passed) {
      item.status = 'verified'
      pushHistory(item, actor, '扫码核销', '物品到场，核验通过')
      return item
    }

    if (shouldFreeze) {
      freezeItem(item, flags, rec, actor)
      return item
    }

    // 未勾选具体问题标记的存疑核销：进入一般异常处理
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
    return item
  }

  /** 冻结问题物品及其关联撮合 */
  function freezeItem(item: Item, flags: ProblemFlag[], rec: CheckInRecord, actor: string) {
    item.status = 'frozen'
    item.freezeFlags = flags
    item.frozenAt = rec.at
    item.issuePhotos = rec.issuePhotos ? [...rec.issuePhotos] : []
    item.rejectCount = (item.rejectCount ?? 0) + 1
    if (item.rejectCount >= 2) item.intensiveReview = true

    const flagText = flags.map((f) => PROBLEM_LABEL[f]).join('、')
    pushHistory(item, actor, '现场问题冻结', `${flagText}${rec.missingPartsNote ? `；缺件说明：${rec.missingPartsNote}` : ''}${rec.note ? `；${rec.note}` : ''}`)

    const match = activeMatchForItem(item.id)
    const other = match
      ? itemById(match.itemAId === item.id ? match.itemBId : match.itemAId)
      : undefined
    if (match && ['confirmed', 'accepted_a', 'accepted_b', 'proposed'].includes(match.status)) {
      match.status = 'frozen'
      match.frozenItemId = item.id
      match.frozenAt = rec.at
      if (other) {
        pushHistory(
          other,
          '系统',
          '关联撮合冻结',
          `配对物品「${item.name}」现场发现${flagText}，请在撮合中心选择处理方式（继续交换 / 自由交换 / 等待替代 / 取消）`,
        )
      }
    }

    reportIncident({
      itemId: item.id,
      matchId: match?.id,
      type: 'item_discrepancy',
      title: `「${item.name}」现场实物不符`,
      message:
        `志愿者现场核销发现：${flagText}。` +
        `${rec.missingPartsNote ? `缺件说明：${rec.missingPartsNote}。` : ''}` +
        `${other ? `原撮合对象为「${other.name}」，等待其选择与社区现场复核。` : '该物品无进行中撮合，由社区直接复核处置。'}`,
      by: actor,
      role: 'volunteer',
      flags,
      issuePhotos: rec.issuePhotos,
      changeItemStatus: false,
    })
  }

  /** 原撮合对象（非问题方家长）对冻结撮合做出选择 */
  function chooseRollout(
    matchId: string,
    userId: string,
    choice: RolloutChoice,
    actor: string,
    note?: string,
  ): { ok: boolean; error?: string } {
    const match = matchById(matchId)
    if (!match) return { ok: false, error: '未找到该撮合组合' }
    if (match.status !== 'frozen') return { ok: false, error: '该组合不在待选择状态' }
    const a = itemById(match.itemAId)
    const b = itemById(match.itemBId)
    if (!a || !b) return { ok: false, error: '撮合物品数据缺失' }
    const frozenItem = itemById(match.frozenItemId ?? '') ?? (a.status === 'frozen' ? a : b)
    const chooserItem = frozenItem.id === a.id ? b : a
    if (chooserItem.parentId !== userId) return { ok: false, error: '只有原撮合对象可以选择处理方式' }

    match.rollout = { choice, by: actor, at: Date.now(), note }

    if (choice === 'continue') {
      pushHistory(chooserItem, actor, '选择继续交换', '申请社区现场复核，比对原始描述后放行，原摊位与时段保留')
      pushHistory(frozenItem, '系统', '等待社区复核', `原撮合对象「${chooserItem.name}」选择继续交换`)
      addIncidentLog(
        activeIncidentForMatch(match.id)?.id ?? '',
        actor,
        'parent',
        `原撮合对象选择【继续交换】，请社区现场复核问题物品并比对原始描述${note ? `；说明：${note}` : ''}`,
      )
      return { ok: true }
    }

    if (choice === 'free_exchange') {
      match.status = 'failed'
      releaseBooth(match, chooserItem, frozenItem)
      chooserItem.status = 'free_zone'
      pushHistory(chooserItem, actor, '选择改为自由交换', '原预约摊位与时段释放，物品进入自由交换区现场另寻交换')
      frozenItem.status = 'frozen'
      pushHistory(frozenItem, '系统', '对方选择自由交换', `原撮合对象「${chooserItem.name}」改为自由交换，问题物品继续等待社区复核处置`)
      logRollout(match.id, actor, `原撮合对象选择【改为自由交换】，原摊位与时段已释放${note ? `；说明：${note}` : ''}`)
      return { ok: true }
    }

    if (choice === 'wait_replace') {
      match.status = 'waiting_replace'
      chooserItem.status = 'waiting_replace'
      // 等待替代期间原摊位释放，入场登记保留
      match.booth = undefined
      chooserItem.booth = undefined
      frozenItem.booth = undefined
      pushHistory(chooserItem, actor, '选择等待替代物品', '已保留到场登记，释放原摊位，等待社区协调同类替代物品')
      pushHistory(frozenItem, '系统', '对方等待替代物品', `原撮合对象「${chooserItem.name}」等待替代物品`)
      logRollout(match.id, actor, `原撮合对象选择【等待替代物品】，保留到场登记、释放原摊位${note ? `；说明：${note}` : ''}`)
      return { ok: true }
    }

    // cancel：按双方实际到场情况分别释放或保留
    match.status = 'cancelled'
    const chooserArrived = !!chooserItem.checkIn
    releaseBooth(match, chooserItem, frozenItem)
    if (chooserArrived) {
      chooserItem.status = 'no_exchange'
      pushHistory(chooserItem, actor, '取消交换（已到场）', '释放摊位与时段，到场登记保留，可在自由交换区继续交换、带回或申请转捐')
    } else {
      chooserItem.status = 'approved'
      chooserItem.entryTime = undefined
      pushHistory(chooserItem, actor, '取消交换（未到场）', '预约时段与摊位已释放，物品回到待撮合池，避免再次自动配对同一物品')
    }
    pushHistory(frozenItem, '系统', '对方取消交换', `原撮合对象「${chooserItem.name}」取消，问题物品继续等待社区复核处置`)
    logRollout(
      match.id,
      actor,
      `原撮合对象选择【取消】（${chooserArrived ? '已到场，保留到场登记' : '未到场，释放预约'}），摊位与时段已释放${note ? `；说明：${note}` : ''}`,
    )
    return { ok: true }
  }

  function releaseBooth(match: Match, ...items: (Item | undefined)[]) {
    match.booth = undefined
    for (const it of items) {
      if (it) it.booth = undefined
    }
  }

  function activeIncidentForMatch(matchId: string) {
    return db.value.incidents.find((i) => i.matchId === matchId && i.status !== 'resolved')
  }

  /** 组合是否满足确认成交条件：已预约、双方核销通过、无未解决争议/调解 */
  function canConfirmExchange(match: Match): boolean {
    if (match.status !== 'confirmed') return false
    if (activeIncidentForMatch(match.id)) return false
    const a = itemById(match.itemAId)
    const b = itemById(match.itemBId)
    return !!a && !!b && a.status === 'verified' && b.status === 'verified'
  }
  /**
   * 问题物品被社区处置（放行但不继续组合 / 确认退回 / 强化复核 / 转捐）后，
   * 按原撮合对象的选择与实际到场情况分别处置对方物品：
   * - 已选择自由交换 / 继续交换（无法继续）：进自由交换区；
   * - 已选择取消：家长已自行处置，不动；
   * - 等待替代：进自由交换区；
   * - 尚未选择：已到场→自由交换区，未到场→释放预约回待撮合池（避免再次被同一物品撮合）。
   */
  function settleCounterpartOnReject(
    match: Match,
    problemItem: Item,
    actor: string,
    reason = `配对物品「${problemItem.name}」现场问题已由社区处置，原组合解除`,
  ) {
    const otherId = match.itemAId === problemItem.id ? match.itemBId : match.itemAId
    const other = itemById(otherId)
    if (!other) {
      match.status = 'failed'
      match.booth = undefined
      return
    }
    const choice = match.rollout?.choice
    if (choice === 'cancel') {
      // 对方已自行取消并完成释放，社区只结束组合
      match.status = 'cancelled'
      return
    }
    match.status = 'failed'
    match.booth = undefined
    if (choice === 'free_exchange' || choice === 'continue' || other.status === 'waiting_replace') {
      other.status = 'free_zone'
      other.booth = undefined
      pushHistory(other, actor, '社区复核处置', `${reason}，您的预约与摊位已释放，物品转入自由交换区，可申请摊位优先级补偿`)
    } else if (!choice) {
      if (other.checkIn) {
        other.status = 'free_zone'
        other.booth = undefined
        pushHistory(other, actor, '社区复核处置', `${reason}，您已到场，可在自由交换区继续交换`)
      } else {
        other.status = 'approved'
        other.booth = undefined
        other.entryTime = undefined
        pushHistory(other, actor, '社区复核处置', `${reason}，您未到场，预约时段与摊位已释放，物品回到待撮合池，不会再与该物品配对`)
      }
    }
  }
  function logRollout(matchId: string, actor: string, message: string) {
    const inc = activeIncidentForMatch(matchId)
    if (inc) addIncidentLog(inc.id, actor, 'parent', message)
  }

  /**
   * 社区现场复核问题物品（不能由家长单方面操作）。
   * - pass：比对原始描述确认无误 → 放行；对方选择继续交换则恢复撮合，否则物品回自由交换区；
   * - reject：确认实物不符 → 物品退回家长带回，累计退回达 2 次暂停家庭自动撮合资格；
   * - re_review：问题可补正 → 带强化照片复核与缺件说明重新进入审核队列；
   * - donate：家长已授权且公益有接收能力 → 转捐候选。
   */
  function reviewFrozenItem(
    itemId: string,
    action: 'pass' | 'reject' | 're_review' | 'donate',
    actor: string,
    note: string,
  ): { ok: boolean; error?: string } {
    const item = itemById(itemId)
    if (!item) return { ok: false, error: '未找到物品' }
    if (item.status !== 'frozen') return { ok: false, error: '该物品不在冻结状态' }
    const match = frozenMatchForItem(item.id)
    const choice = match?.rollout?.choice

    if (action === 'pass') {
      item.status = 'verified'
      item.freezeFlags = undefined
      item.frozenAt = undefined
      pushHistory(item, actor, '现场复核放行', `比对原始描述与问题照片后确认可继续交换：${note}`)
      if (match && choice === 'continue') {
        match.status = 'confirmed'
        match.reviewPassed = true
        match.frozenItemId = undefined
        match.frozenAt = undefined
        // 复核期间摊位与时段一直保留，恢复后双方直接核销/成交
        pushHistory(item, '系统', '撮合恢复', '现场复核通过，原摊位与入场时段恢复')
      } else {
        item.status = 'free_zone'
        item.booth = undefined
        pushHistory(item, actor, '转入自由交换区', '原组合已解除，复核放行后进入自由交换区')
        if (match) settleCounterpartOnReject(match, item, actor, '问题物品复核放行但原组合不再继续')
      }
      closeDiscrepancyIncident(item.id, actor, `现场复核放行：${note}`)
      return { ok: true }
    }

    if (action === 'reject') {
      item.status = 'taken_back'
      item.booth = undefined
      pushHistory(item, actor, '复核确认退回', `实物与报名描述不符，物品由家长带回：${note}`)
      const parent = userById(item.parentId)
      if ((item.rejectCount ?? 0) >= 2 && parent && !parent.autoMatchBlocked) {
        parent.autoMatchBlocked = true
        parent.autoMatchBlockReason = `累计 ${item.rejectCount} 次现场实物不符被退回，完成强化照片复核前暂停自动撮合`
        pushHistory(item, '系统', '暂停自动撮合资格', '该家庭累计多次现场退回，后续报名需强化照片复核与缺件说明')
      }
      if (match && ['frozen', 'waiting_replace'].includes(match.status)) {
        settleCounterpartOnReject(match, item, actor)
      }
      closeDiscrepancyIncident(item.id, actor, `复核确认实物不符，物品退回家长带回：${note}`)
      return { ok: true }
    }

    if (action === 're_review') {
      item.intensiveReview = true
      item.status = 'pending'
      item.freezeFlags = undefined
      item.frozenAt = undefined
      item.booth = undefined
      pushHistory(item, actor, '发起强化复核', '请家长补充多角度照片与缺件说明后，重新进入审核队列')
      if (match && ['frozen', 'waiting_replace'].includes(match.status)) {
        settleCounterpartOnReject(match, item, actor)
      }
      closeDiscrepancyIncident(item.id, actor, `转强化照片复核与缺件说明流程：${note}`)
      return { ok: true }
    }

    // action === 'donate'
    if (!item.acceptDonation) {
      const msg = '家长报名时未授权公益捐赠，不能转捐；已请工作人员现场征得家长书面/口头同意后再处置'
      const inc0 = db.value.incidents.find(
        (i) => i.itemId === item.id && i.type === 'item_discrepancy' && i.status !== 'resolved',
      )
      if (inc0) inc0.logs.push({ at: Date.now(), actor, role: 'staff', message: `【转捐校验未通过】${msg}` })
      return { ok: false, error: '家长未授权公益捐赠，不能转捐；请先征得家长同意或改为带回' }
    }
    const charity = db.value.users.find((u) => u.role === 'charity')
    if (!charity || (charity.capacity ?? 0) <= 0) {
      reportIncident({
        itemId: item.id, type: 'charity_capacity',
        title: `「${item.name}」公益接收能力不足`,
        message: '社区协调转捐时发现公益机构剩余接收能力不足，需协调其他去向。',
        by: actor, role: 'staff', changeItemStatus: false,
      })
      return { ok: false, error: '公益机构接收能力不足，已生成异常待协调' }
    }
    item.status = 'no_exchange'
    item.booth = undefined
    if (match && ['frozen', 'waiting_replace'].includes(match.status)) {
      settleCounterpartOnReject(match, item, actor, '问题物品经社区协调转捐，原组合解除')
    }
    const d = requestDonation(item.id, actor, 'staff')
    closeDiscrepancyIncident(item.id, actor, `家长已授权捐赠且公益有接收能力，已协调转捐：${note}`)
    return d ? { ok: true } : { ok: false, error: '转捐申请创建失败' }
  }

  function closeDiscrepancyIncident(itemId: string, actor: string, resolution: string) {
    const inc = db.value.incidents.find(
      (i) => i.itemId === itemId && i.type === 'item_discrepancy' && i.status !== 'resolved',
    )
    if (inc) {
      inc.status = 'resolved'
      inc.resolution = resolution
      inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【处理结论】${resolution}` })
    }
  }

  /** 社区为受影响的一方改约入场时段（摊位按优先权重排） */
  function rescheduleItem(itemId: string, slot: string, actor: string, note?: string): { ok: boolean; error?: string } {
    const item = itemById(itemId)
    if (!item) return { ok: false, error: '未找到物品' }
    if (!db.value.event.timeSlots.includes(slot)) return { ok: false, error: '入场时段不在活动安排内' }
    if (!item.timeSlots.includes(slot)) return { ok: false, error: '该时段不在家长报名的可到场时间内' }
    item.entryTime = slot
    pushHistory(item, actor, '社区改约', `入场时段调整为 ${slot}${note ? `；${note}` : ''}`)
    return { ok: true }
  }

  /** 社区补偿摊位优先权重 */
  function compensateBoothPriority(parentId: string, actor: string, reason: string) {
    const parent = userById(parentId)
    if (!parent) return
    parent.boothPriority = (parent.boothPriority ?? 0) + 1
    for (const it of itemsByParent(parentId)) {
      pushHistory(it, actor, '补偿摊位优先级', reason)
    }
  }

  /** 社区发起人工调解（价值争议等），调解期间双方均不能改写交换结果 */
  function startMediation(incidentId: string, actor: string, message: string) {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc) return
    // 保留原异常类型（处置选项依类型而定），调解过程以 mediation 标记
    inc.mediation = { status: 'in_mediation', requestedAt: inc.mediation?.requestedAt ?? Date.now(), mediator: actor }
    inc.status = 'processing'
    inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【转人工调解】${message}` })
    const item = itemById(inc.itemId)
    if (item && ['verified', 'arrived', 'reserved'].includes(item.status)) {
      item.status = 'disputed'
      pushHistory(item, actor, '转人工调解', '调解结论作出前，任何一方不得单独更改交换结果')
    }
  }

  /** 调解办结：由社区依据现场复核与原始描述给出最终处置 */
  function finishMediation(
    incidentId: string,
    actor: string,
    result: string,
    effects: ResolveEffects,
  ) {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc) return
    inc.mediation = { ...(inc.mediation ?? { requestedAt: Date.now() }), status: 'done', mediator: actor, result }
    resolveIncident(incidentId, actor, `人工调解结论：${result}`, effects)
  }

  /** 确认一组预约交换完成（存在未解决争议/调解中的组合禁止成交） */
  function confirmExchange(matchId: string, actor: string): boolean {
    const match = matchById(matchId)
    if (!match || match.status !== 'confirmed') return false
    const openIncident = db.value.incidents.some(
      (i) => i.matchId === matchId && i.status !== 'resolved',
    )
    if (openIncident) return false
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
    const ok = (s: ItemStatus) => ['verified', 'arrived', 'free_zone', 'no_exchange', 'waiting_replace'].includes(s)
    if (!ok(a.status) || !ok(b.status)) return false
    const { score, reasons } = scorePair(a, b)
    const match: Match = {
      id: uid('m'), itemAId: a.id, itemBId: b.id, score, reasons,
      status: 'completed', onsite: true, createdAt: Date.now(),
    }
    db.value.matches.unshift(match)
    // 若任一方来自「等待替代物品」，关闭其原冻结撮合
    for (const it of [a, b]) {
      const old = frozenMatchForItem(it.id)
      if (old && old.status === 'waiting_replace') {
        old.status = 'failed'
        const problemItem = itemById(old.frozenItemId ?? '')
        if (problemItem && problemItem.status === 'frozen') {
          pushHistory(problemItem, actor, '替代交换完成', '原撮合对象已在自由交换区与其他物品成交')
        }
      }
    }
    for (const it of [a, b]) {
      it.status = 'exchanged'
      const other = it.id === a.id ? b : a
      pushHistory(it, actor, '自由交换成功', `在自由交换区与「${other.name}」完成交换`)
    }
    return true
  }

  /** 预约物品未到场（处于冻结/回滚流程的组合由异常处置台处理，不在此标记缺席） */
  function markNoShow(itemId: string, actor: string) {
    const item = itemById(itemId)
    if (!item || !['reserved', 'matched'].includes(item.status)) return
    const fm = frozenMatchForItem(itemId)
    if (fm) return
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

  /** 自由交换区/无人交换/等待替代物品家长带回 */
  function takeBack(itemId: string, actor: string) {
    const item = itemById(itemId)
    if (!item) return
    if (!['free_zone', 'no_exchange', 'waiting_replace', 'disputed'].includes(item.status)) return
    const waitingMatch = frozenMatchForItem(itemId)
    if (waitingMatch && waitingMatch.status === 'waiting_replace' && item.status === 'waiting_replace') {
      waitingMatch.status = 'failed'
    }
    item.status = 'taken_back'
    item.booth = undefined
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
    flags?: ProblemFlag[]
    issuePhotos?: string[]
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
      flags: payload.flags,
      issuePhotos: payload.issuePhotos ? [...payload.issuePhotos] : undefined,
    }
    db.value.incidents.unshift(incident)
    const item = itemById(payload.itemId)
    if (item && payload.changeItemStatus !== false && item.status !== 'disputed' && item.status !== 'frozen') {
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
  }

  function resolveIncident(incidentId: string, actor: string, resolution: string, effects: ResolveEffects) {
    const inc = db.value.incidents.find((i) => i.id === incidentId)
    if (!inc) return
    inc.status = 'resolved'
    inc.resolution = resolution
    inc.logs.push({ at: Date.now(), actor, role: 'staff', message: `【处理结论】${resolution}` })

    const item = itemById(inc.itemId)
    const releaseBoothStatuses: ItemStatus[] = ['free_zone', 'taken_back', 'approved', 'no_exchange', 'donated']
    if (item && effects.itemStatus) {
      item.status = effects.itemStatus
      if (releaseBoothStatuses.includes(effects.itemStatus)) item.booth = undefined
      pushHistory(item, actor, '争议处理完成', resolution)
    }
    const match = inc.matchId ? matchById(inc.matchId) : activeMatchForItem(inc.itemId)
    if (match && effects.matchStatus) {
      match.status = effects.matchStatus
      if (effects.matchStatus === 'failed' || effects.matchStatus === 'cancelled') match.booth = undefined
    }
    if (match && effects.counterpartStatus) {
      const otherId = match.itemAId === inc.itemId ? match.itemBId : match.itemAId
      const other = itemById(otherId)
      if (other) {
        other.status = effects.counterpartStatus
        if (releaseBoothStatuses.includes(effects.counterpartStatus)) other.booth = undefined
        pushHistory(other, actor, '关联处理', `配对物品处理：${resolution}`)
      }
    }
  }

  // ---------- 捐赠 ----------
  /**
   * 发起公益转捐申请。双重前置校验：
   * 1) 家长捐赠授权（报名时 acceptDonation）；
   * 2) 公益机构仍有接收能力（capacity > 0）。
   * 不满足时返回原因，由调用方（家长端 / 社区协调）给出提示或生成异常。
   */
  function requestDonation(
    itemId: string,
    actor: string,
    initiatedBy: 'parent' | 'staff' = 'parent',
  ): Donation | null {
    const item = itemById(itemId)
    const charity = db.value.users.find((u) => u.role === 'charity')
    if (!item || !charity) return null
    if (db.value.donations.some((d) => d.itemId === itemId && d.status !== 'declined')) return null
    const donation: Donation = {
      id: uid('d'),
      itemId,
      charityId: charity.id,
      status: 'requested',
      createdAt: Date.now(),
      initiatedBy,
      authorized: item.acceptDonation,
    }
    db.value.donations.unshift(donation)
    pushHistory(
      item,
      actor,
      initiatedBy === 'staff' ? '社区协调转捐' : '申请公益转捐',
      `家长${item.acceptDonation ? '已授权捐赠，' : ''}等待「${charity.orgName}」接收（剩余能力 ${charity.capacity ?? 0} 件）`,
    )
    return donation
  }

  function respondDonation(donationId: string, accept: boolean, actor: string, note?: string) {
    const d = db.value.donations.find((x) => x.id === donationId)
    if (!d || d.status !== 'requested') return
    const item = itemById(d.itemId)
    const charity = userById(d.charityId)
    if (!item || !charity) return
    if (accept) {
      // 接收前再次校验：家长授权与公益剩余接收能力
      if (!item.acceptDonation || d.authorized === false) {
        d.status = 'declined'
        d.note = '家长未授权捐赠'
        reportIncident({
          itemId: item.id, type: 'charity_capacity',
          title: `「${item.name}」捐赠授权缺失`,
          message: '家长报名时未授权公益捐赠，需社区重新征得家长同意。',
          by: actor, role: 'charity', changeItemStatus: false,
        })
        return
      }
      if ((charity.capacity ?? 0) <= 0) {
        d.status = 'declined'
        d.note = '接收能力不足'
        pushHistory(item, actor, '公益拒收', '接收能力不足')
        reportIncident({
          itemId: item.id, type: 'charity_capacity',
          title: `「${item.name}」公益接收能力不足`,
          message: `${charity.orgName} 接收能力已用完，无法接收该物品，请社区协调其他去向。`,
          by: actor, role: 'charity', changeItemStatus: false,
        })
        return
      }
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
    const waitingReplace = all.filter((i) => i.status === 'waiting_replace')
    const onsiteRejected = all.filter((i) => (i.rejectCount ?? 0) > 0)
    const blockedFamilies = db.value.users.filter((u) => u.role === 'parent' && u.autoMatchBlocked)

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
      waitingReplace,
      onsiteRejected,
      blockedFamilies,
      gap,
    }
  })

  return {
    db, event, users, items, matches, incidents, donations,
    userById, itemById, itemByCode, matchById, itemsByParent,
    pendingItems, approvedPool, freeZoneItems, reservedItems, arrivedItems,
    frozenItems, waitingItems, intensiveReviewItems, rejectedOnsiteItems,
    matchesForItem, activeMatchForItem, frozenMatchForItem, incidentsForItem, openIncidents,
    boothUsed, familyAutoMatchBlocked, donationCandidatePool,
    submitItem, reviewItem,
    runAutoMatch, proposeFromRecommendation, recommendationsFor, respondMatch, moveUnmatchedToFreeZone,
    checkIn, confirmExchange, canConfirmExchange, onsiteFreeExchange, markNoShow, takeBack,
    chooseRollout, reviewFrozenItem, rescheduleItem, compensateBoothPriority,
    startMediation, finishMediation,
    reportIncident, addIncidentLog, resolveIncident,
    requestDonation, respondDonation,
    setPhase, resetAll, summary,
  }
})
