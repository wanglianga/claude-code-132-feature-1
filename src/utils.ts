import type { Item } from './types'
import { CATEGORY_META } from './meta'

let seq = 0
export function uid(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.floor(Math.random() * 1e4).toString(36)}`
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtValue(range: [number, number]): string {
  return range[1] >= 9999 ? `${range[0]} 元以上` : `${range[0]}–${range[1]} 元`
}

export function fmtAge(range: [number, number]): string {
  return `${range[0]}–${range[1]} 岁`
}

function overlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1]
}

export interface PairScore {
  score: number
  reasons: string[]
}

/**
 * 撮合评分：双方期望品类（各 30）、孩子年龄段契合（15）、
 * 价值区间契合（15）、可到场时间重合（10）、双方均已消毒（5）。
 */
export function scorePair(a: Item, b: Item): PairScore {
  const reasons: string[] = []
  if (a.parentId === b.parentId) return { score: -1, reasons }
  let score = 0
  const catA = CATEGORY_META[a.category].label
  const catB = CATEGORY_META[b.category].label
  if (a.desiredCategories.includes(b.category)) {
    score += 30
    reasons.push(`甲方期望「${catB}」，乙方提供的正是${catB}`)
  }
  if (b.desiredCategories.includes(a.category)) {
    score += 30
    reasons.push(`乙方期望「${catA}」，甲方提供的正是${catA}`)
  }
  if (overlap(a.ageRange, b.ageRange)) {
    score += 15
    reasons.push('适用年龄段契合')
  }
  if (overlap(a.valueRange, b.valueRange)) {
    score += 15
    reasons.push('价值区间接近')
  }
  const slots = a.timeSlots.filter((s) => b.timeSlots.includes(s))
  if (slots.length > 0) {
    score += 10
    reasons.push(`可到场时间重合（${slots[0]}）`)
  }
  if (a.disinfected && b.disinfected) {
    score += 5
    reasons.push('双方均已消毒')
  }
  return { score, reasons }
}

/** 为某件物品在候选池中找出推荐组合（按分数降序） */
export function recommendFor(item: Item, pool: Item[], limit = 3): { item: Item; score: number; reasons: string[] }[] {
  return pool
    .filter((c) => c.id !== item.id && c.parentId !== item.parentId)
    .map((c) => ({ item: c, ...scorePair(item, c) }))
    .filter((r) => r.score >= 30)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
}

/** 一键智能撮合：贪心选取高分组合，受摊位容量限制 */
export function autoMatch(pool: Item[], boothCapacity: number, alreadyReserved: number): { a: Item; b: Item; score: number; reasons: string[] }[] {
  const pairs: { a: Item; b: Item; score: number; reasons: string[] }[] = []
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const { score, reasons } = scorePair(pool[i], pool[j])
      if (score >= 40) pairs.push({ a: pool[i], b: pool[j], score, reasons })
    }
  }
  pairs.sort((x, y) => y.score - x.score)
  const used = new Set<string>()
  const result: { a: Item; b: Item; score: number; reasons: string[] }[] = []
  let slotsLeft = Math.max(0, boothCapacity - alreadyReserved)
  for (const p of pairs) {
    if (slotsLeft <= 0) break
    if (used.has(p.a.id) || used.has(p.b.id)) continue
    used.add(p.a.id)
    used.add(p.b.id)
    result.push(p)
    slotsLeft -= 1
  }
  return result
}

/** 双方可到场时间的第一个重合时段 */
export function commonSlot(a: Item, b: Item, fallback: string[]): string {
  const s = a.timeSlots.find((x) => b.timeSlots.includes(x))
  return s ?? a.timeSlots[0] ?? fallback[0] ?? '09:00-10:30'
}
