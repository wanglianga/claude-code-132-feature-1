import type { Category, Condition, CounterpartChoiceKind, EventPhase, IncidentType, ItemStatus, ProblemType, Role } from './types'

export const CATEGORY_META: Record<Category, { label: string; icon: string; allowed: boolean }> = {
  toy: { label: '玩具', icon: '🧸', allowed: true },
  book: { label: '绘本', icon: '📚', allowed: true },
  clothing: { label: '衣物', icon: '👕', allowed: true },
  study: { label: '学习用品', icon: '✏️', allowed: true },
  baby: { label: '婴童用品', icon: '🍼', allowed: true },
  dangerous: { label: '危险品', icon: '⚠️', allowed: false },
  food: { label: '食品', icon: '🍪', allowed: false },
  medicine: { label: '药品', icon: '💊', allowed: false },
  privacy: { label: '隐私物品', icon: '🔒', allowed: false },
}

export const ALLOWED_CATEGORIES: Category[] = ['toy', 'book', 'clothing', 'study', 'baby']
export const FORBIDDEN_CATEGORIES: Category[] = ['dangerous', 'food', 'medicine', 'privacy']

export const STATUS_META: Record<ItemStatus, { label: string; tone: string }> = {
  pending: { label: '待审核', tone: 'amber' },
  approved: { label: '待撮合', tone: 'blue' },
  rejected: { label: '已驳回', tone: 'red' },
  matched: { label: '撮合待确认', tone: 'purple' },
  reserved: { label: '已预约', tone: 'indigo' },
  free_zone: { label: '自由交换区', tone: 'slate' },
  arrived: { label: '已到场', tone: 'cyan' },
  verified: { label: '核销通过', tone: 'teal' },
  frozen: { label: '问题冻结', tone: 'rose' },
  exchanged: { label: '交换成功', tone: 'green' },
  no_exchange: { label: '无人交换', tone: 'orange' },
  donated: { label: '已转捐', tone: 'pink' },
  taken_back: { label: '已带回', tone: 'gray' },
  no_show: { label: '未到场', tone: 'red' },
  disputed: { label: '争议处理中', tone: 'rose' },
}

export const CONDITION_META: Record<Condition, string> = {
  new: '全新',
  like_new: '九成新',
  good: '七成新',
  fair: '五成新',
}

export const ROLE_META: Record<Role, { label: string; icon: string }> = {
  parent: { label: '家长', icon: '👨‍👩‍👧' },
  staff: { label: '社区工作人员', icon: '🏢' },
  volunteer: { label: '志愿者', icon: '🙋' },
  charity: { label: '公益机构', icon: '💚' },
}

export const INCIDENT_META: Record<IncidentType, { label: string; icon: string }> = {
  no_show: { label: '家长临时缺席', icon: '🚫' },
  photo_mismatch: { label: '物品与照片不符', icon: '📷' },
  child_regret: { label: '孩子现场反悔', icon: '😢' },
  value_dispute: { label: '双方价值争议', icon: '⚖️' },
  charity_capacity: { label: '公益接收能力不足', icon: '📦' },
  item_problem: { label: '实物不符冻结', icon: '🧊' },
  mediation: { label: '转人工调解', icon: '🧑‍⚖️' },
}

/** 志愿者现场可标记的三类实物问题 */
export const PROBLEM_META: Record<ProblemType, { label: string; icon: string; hint: string }> = {
  missing_parts: { label: '缺少关键零件', icon: '🧩', hint: '如遥控器、配件、套装组件缺失，需在缺件说明中列明' },
  photo_differs: { label: '与报名照片差异较大', icon: '📷', hint: '实物成色、款式、颜色等与报名照片明显不一致' },
  sanitation: { label: '消毒状态无法确认', icon: '🧴', hint: '家长申报已消毒但现场无法确认，或物品明显未清洁' },
}

/** 原撮合对象在对方物品冻结后的四个选择 */
export const CHOICE_META: Record<CounterpartChoiceKind, { label: string; icon: string; desc: string }> = {
  continue: { label: '继续交换', icon: '✅', desc: '知晓问题并愿意按现状继续交换，需社区现场复核确认' },
  free_exchange: { label: '改为自由交换', icon: '🎪', desc: '解除本组合，物品转入自由交换区另寻交换对象' },
  wait: { label: '等待替代物品', icon: '⏳', desc: '保留预约时段与摊位，由社区协调替代物品后再交换' },
  cancel: { label: '取消', icon: '✖️', desc: '取消本次交换；已到场可保留时段改约，未到场则释放时段' },
}

export const PHASE_META: Record<EventPhase, { label: string; desc: string }> = {
  signup: { label: '报名审核', desc: '家长提交物品，社区审核' },
  matching: { label: '撮合配对', desc: '系统推荐组合，家长确认预约' },
  onsite: { label: '现场活动', desc: '扫码核销、现场交换、异常处理' },
  finished: { label: '活动总结', desc: '汇总成果，规划下一场' },
}

export const REJECT_REASONS = [
  '危险品禁止带入活动现场',
  '食品类物品不参与交换',
  '药品类物品不参与交换',
  '涉及个人隐私的物品不参与交换',
  '物品破损严重，不适合交换',
  '照片不清晰，请重新上传',
  '其他原因（请说明）',
]

export const VALUE_RANGES: { label: string; range: [number, number] }[] = [
  { label: '0–20 元', range: [0, 20] },
  { label: '21–50 元', range: [21, 50] },
  { label: '51–100 元', range: [51, 100] },
  { label: '100 元以上', range: [101, 9999] },
]

export const AGE_RANGES: { label: string; range: [number, number] }[] = [
  { label: '0–3 岁', range: [0, 3] },
  { label: '3–6 岁', range: [3, 6] },
  { label: '6–9 岁', range: [6, 9] },
  { label: '9–12 岁', range: [9, 12] },
]
