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
}

export interface CheckInRecord {
  at: number
  by: string
  photoMatch: boolean
  damage: 'none' | 'minor' | 'severe'
  disinfectedConfirmed: boolean
  note?: string
  passed: boolean
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
}

// ============ 异常 / 争议 ============
export type IncidentType =
  | 'no_show'          // 家长临时缺席
  | 'photo_mismatch'   // 物品与照片不符
  | 'child_regret'     // 孩子现场反悔
  | 'value_dispute'    // 双方价值争议
  | 'charity_capacity' // 公益组织接收能力不足

export type IncidentStatus = 'open' | 'processing' | 'resolved'

export interface IncidentLog {
  at: number
  actor: string
  role: Role
  message: string
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
