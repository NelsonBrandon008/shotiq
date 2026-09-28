// Synthetic-league test for src/lib/adjMath.js — verifies the iterative
// solver actually recovers known "true" ratings from simulated results,
// before this math gets trusted with real ESPN data.

import { computeAdjEfficiency, attachRanks, clusterConferences } from '../src/lib/adjMath.js'

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const rand = seededRandom(42)
const LG_AVG = 105 // league avg pts/100poss, off and def both anchor here

// Build N teams across a few "conferences" with known true adjO/adjD.
const N = 60
const CONFS = 4
const trueTeams = Array.from({ length: N }, (_, i) => ({
  id: `T${i}`,
  conf: `C${i % CONFS}`,
  trueO: LG_AVG + (rand() - 0.5) * 30, // spread of ratings
  trueD: LG_AVG + (rand() - 0.5) * 30,
  tempo: 66 + (rand() - 0.5) * 10,
}))

// Round-robin-ish schedule: each team plays ~22 games, ~14 in-conference,
// ~8 out-of-conference against random opponents.
const HCA = 0.014
function simulateGame(a, b, loc) {
  // loc from a's perspective
  const fa = loc === 'home' ? HCA : loc === 'away' ? -HCA : 0
  const fb = -fa
  // "raw" scoring in this one game = sqrt(a's true offense * b's true
  // defense-allowed factor), roughly, plus small noise. Simple multiplicative
  // combination consistent with the model's own assumption.
  const aPts = (a.trueO * (b.trueD / LG_AVG) * (1 + fa)) * (a.tempo / 100) * (1 + (rand() - 0.5) * 0.06)
  const bPts = (b.trueO * (a.trueD / LG_AVG) * (1 + fb)) * (b.tempo / 100) * (1 + (rand() - 0.5) * 0.06)
  return { aPts, bPts }
}

const games = new Map(trueTeams.map((t) => [t.id, []]))
const totals = new Map(trueTeams.map((t) => [t.id, { ptsFor: 0, ptsAgainst: 0, poss: 0, gp: 0 }]))

function playGame(a, b, locA) {
  const { aPts, bPts } = simulateGame(a, b, locA)
  const poss = (a.tempo + b.tempo) / 2
  games.get(a.id).push({ oppId: b.id, loc: locA, conf: a.conf === b.conf })
  games.get(b.id).push({ oppId: a.id, loc: locA === 'home' ? 'away' : locA === 'away' ? 'home' : 'neutral', conf: a.conf === b.conf })
  const ta = totals.get(a.id)
  ta.ptsFor += aPts; ta.ptsAgainst += bPts; ta.poss += poss; ta.gp += 1
  const tb = totals.get(b.id)
  tb.ptsFor += bPts; tb.ptsAgainst += aPts; tb.poss += poss; tb.gp += 1
}

// In-conference: round robin within each conference group (home+away).
for (let c = 0; c < CONFS; c++) {
  const members = trueTeams.filter((t) => t.conf === `C${c}`)
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      playGame(members[i], members[j], 'home')
      playGame(members[j], members[i], 'home')
    }
  }
}
// Non-conference: each team gets ~6 random out-of-conference games.
for (const t of trueTeams) {
  for (let k = 0; k < 6; k++) {
    let opp
    do {
      opp = trueTeams[Math.floor(rand() * trueTeams.length)]
    } while (opp.id === t.id || opp.conf === t.conf)
    const loc = rand() < 0.5 ? 'home' : 'away'
    playGame(t, opp, loc === 'home' ? 'home' : 'away')
  }
}

const inputTeams = trueTeams.map((t) => {
  const tot = totals.get(t.id)
  return {
    id: t.id,
    gp: tot.gp,
    poss: tot.poss / tot.gp,
    ptsFor: tot.ptsFor,
    ptsAgainst: tot.ptsAgainst,
    games: games.get(t.id),
  }
})

const { rows, iterationsRun, converged, leagueAvg } = computeAdjEfficiency(inputTeams)
console.log(`Converged: ${converged} after ${iterationsRun} iterations, league avg ${leagueAvg.toFixed(2)}`)

// Compare recovered adjO/adjD to true values.
let sumErrO = 0, sumErrD = 0, maxErrO = 0, maxErrD = 0
const byId = new Map(rows.map((r) => [r.id, r]))
for (const t of trueTeams) {
  const r = byId.get(t.id)
  const errO = Math.abs(r.adjO - t.trueO)
  const errD = Math.abs(r.adjD - t.trueD)
  sumErrO += errO; sumErrD += errD
  maxErrO = Math.max(maxErrO, errO); maxErrD = Math.max(maxErrD, errD)
}
console.log(`Mean abs error  offense: ${(sumErrO / N).toFixed(2)}  defense: ${(sumErrD / N).toFixed(2)}`)
console.log(`Max abs error   offense: ${maxErrO.toFixed(2)}  defense: ${maxErrD.toFixed(2)}`)

// Rank correlation check (Spearman-ish via simple comparison of orderings).
function spearman(trueVals, estVals) {
  const n = trueVals.length
  const rankOf = (vals, higherBetter) => {
    const sorted = [...vals.keys()].sort((a, b) => (higherBetter ? vals[b] - vals[a] : vals[a] - vals[b]))
    const r = new Array(n)
    sorted.forEach((idx, rank) => (r[idx] = rank))
    return r
  }
  const rt = rankOf(trueVals, true)
  const re = rankOf(estVals, true)
  let d2 = 0
  for (let i = 0; i < n; i++) d2 += (rt[i] - re[i]) ** 2
  return 1 - (6 * d2) / (n * (n * n - 1))
}

const trueO = trueTeams.map((t) => t.trueO)
const estO = trueTeams.map((t) => byId.get(t.id).adjO)
const trueEM = trueTeams.map((t) => t.trueO - t.trueD)
const estEM = trueTeams.map((t) => byId.get(t.id).adjEM)
console.log(`Spearman rank correlation  offense: ${spearman(trueO, estO).toFixed(4)}  margin: ${spearman(trueEM, estEM).toFixed(4)}`)

// Sanity check ranking + conference clustering machinery.
const confOf = clusterConferences(inputTeams)
console.log(`Conferences detected: ${new Set(confOf.values()).size} (expected ${CONFS})`)
const ranked = attachRanks(rows, confOf)
const sample = ranked.find((r) => r.id === 'T0')
console.log('Sample team T0 rank row:', {
  adjO: sample.adjO.toFixed(1), rkO: sample.rkO,
  adjD: sample.adjD.toFixed(1), rkD: sample.rkD,
  adjEM: sample.adjEM.toFixed(1), rkEM: sample.rkEM,
  conf: sample.conf, cRkEM: sample.cRkEM, confSize: sample.confSize,
})

// Pass/fail gate for CI-style sanity.
const PASS = converged && sumErrO / N < 3 && sumErrD / N < 3 && spearman(trueEM, estEM) > 0.85
console.log(PASS ? '\nPASS' : '\nFAIL')
process.exit(PASS ? 0 : 1)
