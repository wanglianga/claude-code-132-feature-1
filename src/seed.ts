import type { DB, HistoryEntry, Item, ItemStatus, User } from './types'

const H = 3600_000
const now = Date.now()

function h(at: number, actor: string, action: string, detail?: string): HistoryEntry {
  return { at, actor, action, detail }
}

const users: User[] = [
  { id: 'u_p1', username: 'parent1', password: '123456', name: '王晓', role: 'parent', phone: '13800000001', childName: '天天', childAge: 5 },
  { id: 'u_p2', username: 'parent2', password: '123456', name: '李敏', role: 'parent', phone: '13800000002', childName: '豆豆', childAge: 7 },
  { id: 'u_p3', username: 'parent3', password: '123456', name: '张磊', role: 'parent', phone: '13800000003', childName: '果果', childAge: 3, autoMatchBlocked: true, autoMatchBlockReason: '累计 2 次现场实物不符被退回，完成强化照片复核前暂停自动撮合' },
  { id: 'u_p4', username: 'parent4', password: '123456', name: '陈静', role: 'parent', phone: '13800000004', childName: '乐乐', childAge: 9 },
  { id: 'u_staff', username: 'staff', password: '123456', name: '王芳', role: 'staff', phone: '13900000001' },
  { id: 'u_vol', username: 'volunteer', password: '123456', name: '赵伟', role: 'volunteer', phone: '13900000002' },
  { id: 'u_charity', username: 'charity', password: '123456', name: '刘洋', role: 'charity', orgName: '春芽公益', capacity: 19 },
]

interface ItemSeed {
  id: string
  code: string
  parentId: string
  name: string
  category: Item['category']
  condition: Item['condition']
  emoji: string
  disinfected: boolean
  desired: Item['desiredCategories']
  value: [number, number]
  age: [number, number]
  slots: string[]
  donation: boolean
  status: ItemStatus
  note?: string
  booth?: string
  entryTime?: string
  review?: Item['review']
  checkIn?: Item['checkIn']
  rejectCount?: number
  intensiveReview?: boolean
  freezeFlags?: Item['freezeFlags']
  frozenAt?: number
  issuePhotos?: string[]
  history: HistoryEntry[]
}

const S1 = '09:00-10:30'
const S2 = '10:30-12:00'
const S3 = '13:30-15:00'
const S4 = '15:00-16:30'

function mk(s: ItemSeed): Item {
  return {
    id: s.id,
    code: s.code,
    parentId: s.parentId,
    name: s.name,
    category: s.category,
    condition: s.condition,
    photos: [s.emoji],
    disinfected: s.disinfected,
    desiredCategories: s.desired,
    valueRange: s.value,
    ageRange: s.age,
    timeSlots: s.slots,
    acceptDonation: s.donation,
    note: s.note,
    status: s.status,
    review: s.review,
    booth: s.booth,
    entryTime: s.entryTime,
    checkIn: s.checkIn,
    rejectCount: s.rejectCount,
    intensiveReview: s.intensiveReview,
    freezeFlags: s.freezeFlags,
    frozenAt: s.frozenAt,
    issuePhotos: s.issuePhotos,
    history: s.history,
    createdAt: s.history[0]?.at ?? now,
  }
}

const submitted = (parent: string, at: number) => h(at, parent, '提交报名', '填写物品信息并提交审核')
const approvedH = (at: number) => h(at, '王芳', '审核通过', '物品符合现场交换要求')
const checkedIn = (at: number, by = '赵伟') => h(at, by, '扫码核销', '物品到场，核验通过')

const items: Item[] = [
  // ---------- 待审核 ----------
  mk({
    id: 'itm_001', code: 'SW-1001', parentId: 'u_p1', name: '遥控赛车', category: 'toy', condition: 'good',
    emoji: '🏎️', disinfected: true, desired: ['book', 'study'], value: [51, 100], age: [3, 9],
    slots: [S1, S2], donation: true, status: 'pending',
    note: '遥控器灵敏，车身有轻微划痕',
    history: [submitted('王晓', now - 5 * H)],
  }),
  mk({
    id: 'itm_002', code: 'SW-1002', parentId: 'u_p2', name: '恐龙绘本套装（6 本）', category: 'book', condition: 'like_new',
    emoji: '🦕', disinfected: true, desired: ['toy'], value: [21, 50], age: [3, 6],
    slots: [S1, S3], donation: true, status: 'pending',
    history: [submitted('李敏', now - 4 * H)],
  }),
  mk({
    id: 'itm_003', code: 'SW-1003', parentId: 'u_p3', name: '儿童感冒药（未开封）', category: 'medicine', condition: 'new',
    emoji: '💊', disinfected: false, desired: ['toy'], value: [0, 20], age: [0, 12],
    slots: [S1], donation: false, status: 'pending',
    note: '家里囤多了，想换点玩具',
    history: [submitted('张磊', now - 3 * H)],
  }),
  mk({
    id: 'itm_004', code: 'SW-1004', parentId: 'u_p4', name: '手持烟花棒', category: 'dangerous', condition: 'new',
    emoji: '🎆', disinfected: false, desired: ['toy'], value: [21, 50], age: [6, 12],
    slots: [S2], donation: false, status: 'pending',
    history: [submitted('陈静', now - 2 * H)],
  }),
  // ---------- 审核通过，待撮合 ----------
  mk({
    id: 'itm_005', code: 'SW-1005', parentId: 'u_p1', name: '乐高经典积木盒', category: 'toy', condition: 'good',
    emoji: '🧱', disinfected: true, desired: ['book', 'study'], value: [51, 100], age: [3, 9],
    slots: [S1, S2], donation: true, status: 'approved',
    review: { by: '王芳', at: now - 26 * H, result: 'approved' },
    history: [submitted('王晓', now - 30 * H), approvedH(now - 26 * H)],
  }),
  mk({
    id: 'itm_006', code: 'SW-1006', parentId: 'u_p2', name: '儿童绘本 20 本', category: 'book', condition: 'good',
    emoji: '📖', disinfected: true, desired: ['toy'], value: [51, 100], age: [3, 6],
    slots: [S1, S2], donation: true, status: 'approved',
    review: { by: '王芳', at: now - 26 * H, result: 'approved' },
    history: [submitted('李敏', now - 29 * H), approvedH(now - 26 * H)],
  }),
  mk({
    id: 'itm_007', code: 'SW-1007', parentId: 'u_p3', name: '女童连衣裙（120 码）', category: 'clothing', condition: 'like_new',
    emoji: '👗', disinfected: true, desired: ['book'], value: [21, 50], age: [3, 6],
    slots: [S2, S4], donation: true, status: 'approved',
    review: { by: '王芳', at: now - 25 * H, result: 'approved' },
    history: [submitted('张磊', now - 28 * H), approvedH(now - 25 * H)],
  }),
  mk({
    id: 'itm_008', code: 'SW-1008', parentId: 'u_p4', name: '科学实验套装', category: 'study', condition: 'like_new',
    emoji: '🔬', disinfected: true, desired: ['toy'], value: [51, 100], age: [6, 12],
    slots: [S1, S3], donation: false, status: 'approved',
    review: { by: '王芳', at: now - 25 * H, result: 'approved' },
    history: [submitted('陈静', now - 27 * H), approvedH(now - 25 * H)],
  }),
  // ---------- 已撮合，待确认 ----------
  mk({
    id: 'itm_009', code: 'SW-1009', parentId: 'u_p2', name: '磁力片 64 片', category: 'toy', condition: 'like_new',
    emoji: '🧲', disinfected: true, desired: ['book', 'study'], value: [51, 100], age: [3, 9],
    slots: [S1, S2], donation: true, status: 'matched',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('李敏', now - 28 * H), approvedH(now - 24 * H), h(now - 20 * H, '系统', '智能撮合', '与「少儿百科全书」配对，待双方确认')],
  }),
  mk({
    id: 'itm_010', code: 'SW-1010', parentId: 'u_p4', name: '少儿百科全书', category: 'book', condition: 'good',
    emoji: '📚', disinfected: true, desired: ['toy', 'study'], value: [51, 100], age: [6, 12],
    slots: [S1, S2], donation: true, status: 'matched',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('陈静', now - 27 * H), approvedH(now - 24 * H), h(now - 20 * H, '系统', '智能撮合', '与「磁力片 64 片」配对，待双方确认')],
  }),
  // ---------- 已预约 ----------
  mk({
    id: 'itm_011', code: 'SW-1011', parentId: 'u_p1', name: '儿童平衡车', category: 'toy', condition: 'good',
    emoji: '🛴', disinfected: true, desired: ['study'], value: [101, 9999], age: [3, 6],
    slots: [S1], donation: false, status: 'reserved', booth: 'B-01', entryTime: S1,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('王晓', now - 30 * H), approvedH(now - 24 * H), h(now - 19 * H, '系统', '智能撮合', '与「点读笔套装」配对'), h(now - 10 * H, '系统', '预约成功', '摊位 B-01，入场时段 09:00-10:30')],
  }),
  mk({
    id: 'itm_012', code: 'SW-1012', parentId: 'u_p3', name: '点读笔套装', category: 'study', condition: 'like_new',
    emoji: '🖊️', disinfected: true, desired: ['toy'], value: [101, 9999], age: [3, 6],
    slots: [S1], donation: false, status: 'reserved', booth: 'B-01', entryTime: S1,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('张磊', now - 29 * H), approvedH(now - 24 * H), h(now - 19 * H, '系统', '智能撮合', '与「儿童平衡车」配对'), h(now - 10 * H, '系统', '预约成功', '摊位 B-01，入场时段 09:00-10:30')],
  }),
  // ---------- 已核销（存在进行中的价值争议） ----------
  mk({
    id: 'itm_013', code: 'SW-1013', parentId: 'u_p4', name: '积木桌', category: 'toy', condition: 'good',
    emoji: '🪑', disinfected: true, desired: ['book'], value: [51, 100], age: [3, 6],
    slots: [S1, S2], donation: true, status: 'verified', booth: 'B-02', entryTime: S1,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 2 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [submitted('陈静', now - 28 * H), approvedH(now - 24 * H), h(now - 18 * H, '系统', '预约成功', '摊位 B-02'), checkedIn(now - 2 * H), h(now - 1 * H, '赵伟', '上报异常', '双方对价值存在争议')],
  }),
  mk({
    id: 'itm_014', code: 'SW-1014', parentId: 'u_p2', name: '英语分级读物 30 本', category: 'book', condition: 'good',
    emoji: '🔤', disinfected: true, desired: ['toy'], value: [51, 100], age: [3, 9],
    slots: [S1, S2], donation: true, status: 'verified', booth: 'B-02', entryTime: S1,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 2 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [submitted('李敏', now - 28 * H), approvedH(now - 24 * H), h(now - 18 * H, '系统', '预约成功', '摊位 B-02'), checkedIn(now - 2 * H)],
  }),
  // ---------- 交换成功 ----------
  mk({
    id: 'itm_015', code: 'SW-1015', parentId: 'u_p1', name: '儿童滑板车', category: 'toy', condition: 'good',
    emoji: '🛴', disinfected: true, desired: ['study'], value: [51, 100], age: [3, 9],
    slots: [S1], donation: false, status: 'exchanged', booth: 'B-03', entryTime: S1,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 3 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [submitted('王晓', now - 29 * H), approvedH(now - 24 * H), h(now - 18 * H, '系统', '预约成功', '摊位 B-03'), checkedIn(now - 3 * H), h(now - 2 * H, '赵伟', '交换成功', '与「儿童显微镜」完成交换')],
  }),
  mk({
    id: 'itm_016', code: 'SW-1016', parentId: 'u_p3', name: '儿童显微镜', category: 'study', condition: 'like_new',
    emoji: '🔬', disinfected: true, desired: ['toy'], value: [51, 100], age: [6, 12],
    slots: [S1], donation: false, status: 'exchanged', booth: 'B-03', entryTime: S1,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 3 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [submitted('张磊', now - 29 * H), approvedH(now - 24 * H), h(now - 18 * H, '系统', '预约成功', '摊位 B-03'), checkedIn(now - 3 * H), h(now - 2 * H, '赵伟', '交换成功', '与「儿童滑板车」完成交换')],
  }),
  // ---------- 自由交换区 ----------
  mk({
    id: 'itm_017', code: 'SW-1017', parentId: 'u_p2', name: '毛绒玩具熊', category: 'toy', condition: 'fair',
    emoji: '🧸', disinfected: true, desired: ['book'], value: [0, 20], age: [0, 6],
    slots: [S2, S3], donation: true, status: 'free_zone',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('李敏', now - 27 * H), approvedH(now - 24 * H), h(now - 12 * H, '王芳', '转入自由交换区', '本轮未匹配成功')],
  }),
  mk({
    id: 'itm_018', code: 'SW-1018', parentId: 'u_p3', name: '婴儿背带', category: 'baby', condition: 'good',
    emoji: '🎒', disinfected: true, desired: ['clothing'], value: [21, 50], age: [0, 3],
    slots: [S1, S4], donation: true, status: 'free_zone',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('张磊', now - 26 * H), approvedH(now - 24 * H), h(now - 12 * H, '王芳', '转入自由交换区', '本轮未匹配成功')],
  }),
  // ---------- 无人交换（申请转捐中） ----------
  mk({
    id: 'itm_019', code: 'SW-1019', parentId: 'u_p4', name: '木质拼图 500 片', category: 'toy', condition: 'good',
    emoji: '🧩', disinfected: true, desired: ['study'], value: [21, 50], age: [6, 12],
    slots: [S2], donation: true, status: 'no_exchange',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 4 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [submitted('陈静', now - 26 * H), approvedH(now - 24 * H), checkedIn(now - 4 * H), h(now - 1 * H, '系统', '无人交换', '自由交换区未换出，可申请转捐')],
  }),
  // ---------- 已转捐 ----------
  mk({
    id: 'itm_020', code: 'SW-1020', parentId: 'u_p3', name: '婴儿连体衣 5 件', category: 'clothing', condition: 'good',
    emoji: '👶', disinfected: true, desired: ['baby'], value: [21, 50], age: [0, 3],
    slots: [S1], donation: true, status: 'donated',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 5 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, note: '实物颜色略浅，已现场补拍确认', passed: true },
    history: [submitted('张磊', now - 27 * H), approvedH(now - 24 * H), checkedIn(now - 5 * H), h(now - 2 * H, '系统', '无人交换'), h(now - 1 * H, '刘洋', '公益接收', '春芽公益接收，送往山区幼儿园')],
  }),
  // ---------- 已带回 ----------
  mk({
    id: 'itm_021', code: 'SW-1021', parentId: 'u_p2', name: '儿童书包', category: 'study', condition: 'good',
    emoji: '🎒', disinfected: true, desired: ['toy'], value: [21, 50], age: [6, 9],
    slots: [S3], donation: false, status: 'taken_back',
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    checkIn: { at: now - 4 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [submitted('李敏', now - 26 * H), approvedH(now - 24 * H), checkedIn(now - 4 * H), h(now - 1 * H, '李敏', '自行带回', '未换到心仪物品，选择带回')],
  }),
  // ---------- 未到场 ----------
  mk({
    id: 'itm_022', code: 'SW-1022', parentId: 'u_p4', name: '变形金刚玩具', category: 'toy', condition: 'like_new',
    emoji: '🤖', disinfected: true, desired: ['study'], value: [51, 100], age: [6, 12],
    slots: [S2], donation: false, status: 'no_show', booth: 'B-04', entryTime: S2,
    review: { by: '王芳', at: now - 24 * H, result: 'approved' },
    history: [submitted('陈静', now - 27 * H), approvedH(now - 24 * H), h(now - 16 * H, '系统', '预约成功', '摊位 B-04'), h(now - 1 * H, '赵伟', '标记未到场', '超过入场时段未到，联系方式无人接听')],
  }),
  // ---------- 已驳回 ----------
  mk({
    id: 'itm_023', code: 'SW-1023', parentId: 'u_p1', name: '维生素软糖', category: 'food', condition: 'new',
    emoji: '🍬', disinfected: false, desired: ['toy'], value: [0, 20], age: [3, 12],
    slots: [S1], donation: false, status: 'rejected',
    review: { by: '王芳', at: now - 25 * H, result: 'rejected', reason: '食品类物品不参与交换' },
    history: [submitted('王晓', now - 28 * H), h(now - 25 * H, '王芳', '审核驳回', '食品类物品不参与交换')],
  }),
  // ---------- 现场实物不符：问题物品冻结，对方选择等待替代 ----------
  mk({
    id: 'itm_024', code: 'SW-1024', parentId: 'u_p1', name: '电动轨道火车套装', category: 'toy', condition: 'good',
    emoji: '🚂', disinfected: true, desired: ['book'], value: [51, 100], age: [3, 9],
    slots: [S2, S3], donation: true, status: 'frozen', entryTime: S2,
    review: { by: '王芳', at: now - 22 * H, result: 'approved' },
    rejectCount: 1,
    freezeFlags: ['missing_parts', 'disinfection_unconfirmed'],
    frozenAt: now - 1 * H,
    checkIn: {
      at: now - 1 * H, by: '赵伟', photoMatch: false, damage: 'minor', disinfectedConfirmed: false, passed: false,
      flags: ['missing_parts', 'disinfection_unconfirmed'], missingPartsNote: '缺少 2 节直轨与充电线，外包装有拆封痕迹',
      note: '家长无法确认消毒时间，现场问题冻结', frozen: true,
    },
    history: [
      submitted('王晓', now - 26 * H), approvedH(now - 22 * H),
      h(now - 16 * H, '系统', '智能撮合', '与「世界名著桥梁书 12 册」配对'),
      h(now - 12 * H, '系统', '预约成功', '摊位 B-05，入场时段 10:30-12:00'),
      h(now - 1 * H, '赵伟', '现场问题冻结', '缺少关键零件、消毒状态无法确认；缺件说明：缺少 2 节直轨与充电线，外包装有拆封痕迹'),
    ],
  }),
  mk({
    id: 'itm_025', code: 'SW-1025', parentId: 'u_p2', name: '世界名著桥梁书 12 册', category: 'book', condition: 'like_new',
    emoji: '📚', disinfected: true, desired: ['toy'], value: [51, 100], age: [6, 12],
    slots: [S2, S3], donation: true, status: 'waiting_replace', entryTime: S2,
    review: { by: '王芳', at: now - 22 * H, result: 'approved' },
    checkIn: { at: now - 1.2 * H, by: '赵伟', photoMatch: true, damage: 'none', disinfectedConfirmed: true, passed: true },
    history: [
      submitted('李敏', now - 25 * H), approvedH(now - 22 * H),
      h(now - 16 * H, '系统', '智能撮合', '与「电动轨道火车套装」配对'),
      h(now - 12 * H, '系统', '预约成功', '摊位 B-05，入场时段 10:30-12:00'),
      checkedIn(now - 1.2 * H),
      h(now - 0.8 * H, '李敏', '选择等待替代物品', '已保留到场登记，释放原摊位，等待社区协调同类替代物品'),
    ],
  }),
  // ---------- 现场实物不符：问题物品冻结，等待原撮合对象选择（累计 2 次退回） ----------
  mk({
    id: 'itm_026', code: 'SW-1026', parentId: 'u_p3', name: '可编程启蒙机器人', category: 'toy', condition: 'like_new',
    emoji: '🤖', disinfected: true, desired: ['study'], value: [101, 9999], age: [6, 12],
    slots: [S3], donation: false, status: 'frozen', booth: 'B-06', entryTime: S3,
    review: { by: '王芳', at: now - 22 * H, result: 'approved' },
    rejectCount: 2, intensiveReview: true,
    freezeFlags: ['photo_mismatch'],
    frozenAt: now - 0.5 * H,
    checkIn: {
      at: now - 0.5 * H, by: '赵伟', photoMatch: false, damage: 'minor', disinfectedConfirmed: true, passed: false,
      flags: ['photo_mismatch'], note: '实物为旧款蓝色机器人，报名照片为新款白色，外观与配件差异较大', frozen: true,
    },
    history: [
      submitted('张磊', now - 26 * H), approvedH(now - 22 * H),
      h(now - 14 * H, '系统', '智能撮合', '与「儿童涂鸦画板」配对'),
      h(now - 10 * H, '系统', '预约成功', '摊位 B-06，入场时段 13:30-15:00'),
      h(now - 0.5 * H, '赵伟', '现场问题冻结', '与报名照片差异较大：实物为旧款蓝色机器人，报名照片为新款白色'),
    ],
  }),
  mk({
    id: 'itm_027', code: 'SW-1027', parentId: 'u_p4', name: '儿童涂鸦画板', category: 'study', condition: 'good',
    emoji: '🎨', disinfected: true, desired: ['toy'], value: [101, 9999], age: [3, 9],
    slots: [S3, S4], donation: true, status: 'reserved', booth: 'B-06', entryTime: S3,
    review: { by: '王芳', at: now - 22 * H, result: 'approved' },
    history: [
      submitted('陈静', now - 25 * H), approvedH(now - 22 * H),
      h(now - 14 * H, '系统', '智能撮合', '与「可编程启蒙机器人」配对'),
      h(now - 10 * H, '系统', '预约成功', '摊位 B-06，入场时段 13:30-15:00'),
      h(now - 0.5 * H, '系统', '关联撮合冻结', '配对物品「可编程启蒙机器人」现场发现与报名照片差异较大，等待陈静选择处理方式'),
    ],
  }),
  // ---------- 强化复核期报名（资格暂停家庭的新报名，强制多角度照片+缺件说明） ----------
  mk({
    id: 'itm_028', code: 'SW-1028', parentId: 'u_p3', name: '积木收纳箱（含基础颗粒 200 粒）', category: 'toy', condition: 'good',
    emoji: '🧱', disinfected: true, desired: ['book', 'baby'], value: [21, 50], age: [3, 9],
    slots: [S3, S4], donation: true, status: 'pending', intensiveReview: true,
    note: '强化复核期报名：已附多角度照片与配件清单，请重点核对缺件情况',
    history: [submitted('张磊', now - 1 * H)],
  }),
  // ---------- 资格暂停家庭已通过审核的物品（不参与一键智能撮合，可被人工/自由交换选择） ----------
  mk({
    id: 'itm_029', code: 'SW-1029', parentId: 'u_p3', name: '婴儿手摇铃 5 件套', category: 'baby', condition: 'like_new',
    emoji: '🔔', disinfected: true, desired: ['clothing'], value: [0, 20], age: [0, 3],
    slots: [S4], donation: true, status: 'approved',
    review: { by: '王芳', at: now - 20 * H, result: 'approved' },
    history: [submitted('张磊', now - 24 * H), approvedH(now - 20 * H)],
  }),
]

export function createSeedDB(): DB {
  return {
    users,
    items,
    matches: [
      {
        id: 'm1', itemAId: 'itm_009', itemBId: 'itm_010', score: 95,
        reasons: ['双方期望品类互相契合', '价值区间接近', '可到场时间重合（09:00-10:30）', '双方均已消毒'],
        status: 'proposed', createdAt: now - 20 * H,
      },
      {
        id: 'm2', itemAId: 'itm_011', itemBId: 'itm_012', score: 80,
        reasons: ['双方期望品类互相契合', '适用年龄段契合', '价值区间接近'],
        status: 'confirmed', booth: 'B-01', entryTime: S1, createdAt: now - 19 * H,
      },
      {
        id: 'm3', itemAId: 'itm_013', itemBId: 'itm_014', score: 75,
        reasons: ['双方期望品类互相契合', '价值区间接近', '双方均已消毒'],
        status: 'confirmed', booth: 'B-02', entryTime: S1, createdAt: now - 18 * H,
      },
      {
        id: 'm4', itemAId: 'itm_015', itemBId: 'itm_016', score: 85,
        reasons: ['双方期望品类互相契合', '价值区间接近'],
        status: 'completed', booth: 'B-03', entryTime: S1, createdAt: now - 18 * H,
      },
      {
        id: 'm5', itemAId: 'itm_024', itemBId: 'itm_025', score: 72,
        reasons: ['双方期望品类互相契合', '价值区间接近', '可到场时间重合（10:30-12:00）'],
        status: 'waiting_replace', booth: undefined, entryTime: S2,
        frozenItemId: 'itm_024', frozenAt: now - 1 * H,
        rollout: { choice: 'wait_replace', by: '李敏', at: now - 0.8 * H },
        createdAt: now - 16 * H,
      },
      {
        id: 'm6', itemAId: 'itm_026', itemBId: 'itm_027', score: 78,
        reasons: ['双方期望品类互相契合', '价值区间接近', '可到场时间重合（13:30-15:00）'],
        status: 'frozen', booth: 'B-06', entryTime: S3,
        frozenItemId: 'itm_026', frozenAt: now - 0.5 * H,
        createdAt: now - 14 * H,
      },
    ],
    incidents: [
      {
        id: 'inc1', itemId: 'itm_013', matchId: 'm3', type: 'value_dispute',
        title: '积木桌与英语分级读物的价值争议',
        status: 'open',
        logs: [
          { at: now - 1 * H, actor: '赵伟', role: 'volunteer', message: '现场交换时，李敏认为积木桌成色与照片描述有差距，双方对价值是否对等存在争议，请社区协调。' },
        ],
        createdBy: '赵伟', createdAt: now - 1 * H,
      },
      {
        id: 'inc2', itemId: 'itm_020', type: 'photo_mismatch',
        title: '婴儿连体衣实物与照片色差确认',
        status: 'resolved',
        logs: [
          { at: now - 5 * H, actor: '赵伟', role: 'volunteer', message: '核销时发现实物颜色比照片略浅，疑似色差，请社区确认。' },
          { at: now - 4.5 * H, actor: '王芳', role: 'staff', message: '现场比对为同款衣物，系拍照光线问题，已补拍照片存档。' },
        ],
        resolution: '确认为同款物品，色差系光线问题，物品继续参与交换流程。',
        createdBy: '赵伟', createdAt: now - 5 * H,
      },
      {
        id: 'inc3', itemId: 'itm_024', matchId: 'm5', type: 'item_discrepancy',
        title: '电动轨道火车套装现场实物不符',
        status: 'open',
        flags: ['missing_parts', 'disinfection_unconfirmed'],
        logs: [
          {
            at: now - 1 * H, actor: '赵伟', role: 'volunteer',
            message: '现场核销发现：缺少关键零件、消毒状态无法确认。缺件说明：缺少 2 节直轨与充电线，外包装有拆封痕迹。原撮合对象为「世界名著桥梁书 12 册」，等待其选择与社区现场复核。',
          },
          {
            at: now - 0.8 * H, actor: '李敏', role: 'parent',
            message: '原撮合对象选择【等待替代物品】，保留到场登记、释放原摊位。',
          },
        ],
        createdBy: '赵伟', createdAt: now - 1 * H,
      },
      {
        id: 'inc4', itemId: 'itm_026', matchId: 'm6', type: 'item_discrepancy',
        title: '可编程启蒙机器人现场实物不符',
        status: 'open',
        flags: ['photo_mismatch'],
        logs: [
          {
            at: now - 0.5 * H, actor: '赵伟', role: 'volunteer',
            message: '现场核销发现：与报名照片差异较大。实物为旧款蓝色机器人，报名照片为新款白色，外观与配件差异较大。原撮合对象为「儿童涂鸦画板」，等待陈静选择与社区现场复核。该物品已是第 2 次现场退回。',
          },
        ],
        createdBy: '赵伟', createdAt: now - 0.5 * H,
      },
    ],
    donations: [
      { id: 'd1', itemId: 'itm_020', charityId: 'u_charity', status: 'received', note: '送往山区幼儿园', createdAt: now - 1 * H },
      { id: 'd2', itemId: 'itm_019', charityId: 'u_charity', status: 'requested', createdAt: now - 0.5 * H },
    ],
    event: {
      id: 'ev1',
      name: '阳光社区第三届亲子旧物交换日',
      date: '2026-09-27（周日）09:00–16:30',
      venue: '阳光社区文化活动中心广场',
      phase: 'onsite',
      boothCapacity: 12,
      timeSlots: [S1, S2, S3, S4],
    },
  }
}
