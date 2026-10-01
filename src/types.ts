// ============ 基础角色与用户 ============
export type Role = 'parent' | 'staff' | 'volunteer' | 'charity'

export interface User {
  id: string
  username: string
  password: string
  name: string
  role: Role
  phone?: string
  childName?: string
  childAge?: number
  orgName?: string
  /** 公益机构剩余接收能力（件） */
  capacity?: number
  /** 摊位优先权重（改约 / 补偿获得，越大越优先分配摊位） */
  boothPriority?: number
  /** 自动撮合资格是否被暂停（物品多次现场退回后，经强化复核前不再进入自动撮合） */
  autoMatchBlocked?: boolean
  autoMatchBlockReason?: string
}

// ============ 物品 ============
export type Category =
  | 'toy' | 'book' | 'clothing' | 'study' | 'baby' // 可交换品类
  | 'dangerous' | 'food' | 'medicine' | 'privacy'  // 禁入品类（审核驳回）

export type Condition = 'new' | 'like_new' | 'good' | 'fair'

export type ItemStatus =
  | 'pending'      // 待审核
  | 'approved'     // 审核通过，待撮合
  | 'rejected'     // 已驳回
  | 'matched'      // 已撮合，待双方确认
  | 'reserved'     // 双方确认，已预约摊位与入场时间
  | 'free_zone'    // 未匹配，进入自由交换区
  | 'arrived'      // 已到场（扫码登记）
  | 'verified'     // 核销通过
  | 'exchanged'    // 交换成功
  | 'no_exchange'  // 无人交换
  | 'donated'      // 已转捐
  | 'taken_back'   // 已带回
  | 'no_show'      // 未到场
  | 'disputed'     // 争议/异常处理中
  | 'frozen'       // 现场实物问题冻结（缺件 / 与照片差异大 / 消毒无法确认）
  | 'waiting_replace' // 原撮合对象选择等待替代物品，暂存保留

/** 现场实物问题标记 */
export type ProblemFlag =
  | 'missing_parts'           // 缺少关键零件
  | 'photo_mismatch'          // 与报名照片差异较大
  | 'disinfection_unconfirmed' // 消毒状态无法确认

export interface HistoryEntry {
  at: number
  actor: string
  action: string
  detail?: string
}

export interface ReviewRecord {
  by: string
  at: number
  result: 'approved' | 'rejected'
  reason?: string
  /** 强化照片复核（针对多次退回家庭的报名） */
  intensive?: boolean
}

export interface CheckInRecord {
  at: number
  by: string
  photoMatch: boolean
  damage: 'none' | 'minor' | 'severe'
  disinfectedConfirmed: boolean
  note?: string
  passed: boolean
  /** 现场发现的实物问题（不通过时至少一项） */
  flags?: ProblemFlag[]
  /** 现场问题照片（dataURL） */
  issuePhotos?: string[]
  /** 缺件说明：缺少哪些关键零件 */
  missingPartsNote?: string
  /** 本次核验是否冻结了物品及关联撮合 */
  frozen?: boolean
}

export interface Item {
  id: string
  code: string
  parentId: string
  name: string
  category: Category
  condition: Condition
  /** dataURL 或 emoji 占位 */
  photos: string[]
  disinfected: boolean
  desiredCategories: Category[]
  valueRange: [number, number]
  ageRange: [number, number]
  timeSlots: string[]
  acceptDonation: boolean
  note?: string
  status: ItemStatus
  review?: ReviewRecord
  booth?: string
  entryTime?: string
  checkIn?: CheckInRecord
  history: HistoryEntry[]
  createdAt: number
  /** 现场因实物问题被退回的累计次数 */
  rejectCount?: number
  /** 是否需要强化照片复核（多次退回物品 / 该家庭后续报名） */
  intensiveReview?: boolean
  /** 冻结时留存的问题照片快照 */
  issuePhotos?: string[]
  /** 冻结原因标记 */
  freezeFlags?: ProblemFlag[]
  frozenAt?: number
}

// ============ 撮合 ============
export type MatchStatus =
  | 'proposed'    // 待双方家长确认
  | 'accepted_a'  // A 方已确认
  | 'accepted_b'  // B 方已确认
  | 'confirmed'   // 双方确认，已分配摊位
  | 'declined'    // 一方拒绝
  | 'cancelled'   // 取消
  | 'completed'   // 现场交换完成
  | 'failed'      // 现场未成交
  | 'frozen'      // 一方物品现场出问题，撮合冻结，等待原撮合对象选择
  | 'waiting_replace' // 原撮合对象选择等待替代物品

/** 原撮合对象在对方物品被冻结后的选择 */
export type RolloutChoice =
  | 'continue'      // 继续交换（经社区现场复核放行后生效）
  | 'free_exchange' // 改为自由交换
  | 'wait_replace'  // 等待替代物品
  | 'cancel'        // 取消

export interface RolloutRecord {
  choice: RolloutChoice
  /** 做出选择的家长（未被冻结的一方） */
  by: string
  at: number
  note?: string
}

export interface Match {
  id: string
  itemAId: string
  itemBId: string
  score: number
  reasons: string[]
  status: MatchStatus
  booth?: string
  entryTime?: string
  onsite?: boolean // 现场自由交换登记
  createdAt: number
  /** 被冻结的是哪一件物品 */
  frozenItemId?: string
  frozenAt?: number
  /** 原撮合对象的回滚选择 */
  rollout?: RolloutRecord
  /** 社区现场复核是否放行（继续交换时需要） */
  reviewPassed?: boolean
}

// ============ 异常 / 争议 ============
export type IncidentType =
  | 'no_show'           // 家长临时缺席
  | 'photo_mismatch'    // 物品与照片不符（历史类型）
  | 'item_discrepancy'  // 现场实物不符：缺件 / 照片差异 / 消毒无法确认
  | 'child_regret'      // 孩子现场反悔
  | 'value_dispute'     // 双方价值争议
  | 'charity_capacity'  // 公益组织接收能力不足
  | 'mediation'         // 社区人工调解

export type IncidentStatus = 'open' | 'processing' | 'resolved'

export interface IncidentLog {
  at: number
  actor: string
  role: Role
  message: string
}

export interface MediationRecord {
  status: 'requested' | 'in_mediation' | 'done'
  requestedAt: number
  mediator?: string
  result?: string
}

export interface Incident {
  id: string
  itemId: string
  matchId?: string
  type: IncidentType
  title: string
  status: IncidentStatus
  logs: IncidentLog[]
  resolution?: string
  createdBy: string
  createdAt: number
  /** 现场问题标记与照片（实物不符类异常） */
  flags?: ProblemFlag[]
  issuePhotos?: string[]
  /** 人工调解记录 */
  mediation?: MediationRecord
}

// ============ 捐赠 ============
export type DonationStatus = 'requested' | 'received' | 'declined'

export interface Donation {
  id: string
  itemId: string
  charityId: string
  status: DonationStatus
  note?: string
  createdAt: number
  /** 发起方：家长主动申请 / 社区协调转捐 */
  initiatedBy?: 'parent' | 'staff'
  /** 家长捐赠授权（acceptDonation）与公益接收能力校验是否通过 */
  authorized?: boolean
}

// ============ 活动 ============
export type EventPhase = 'signup' | 'matching' | 'onsite' | 'finished'

export interface EventInfo {
  id: string
  name: string
  date: string
  venue: string
  phase: EventPhase
  boothCapacity: number
  timeSlots: string[]
}

// ============ 持久化数据库 ============
export interface DB {
  users: User[]
  items: Item[]
  matches: Match[]
  incidents: Incident[]
  donations: Donation[]
  event: EventInfo
}
