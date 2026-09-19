// Run with: node --experimental-transform-types scripts/benchmark-performance.mjs
import { performance } from 'node:perf_hooks'
import { groupIssues } from '../packages/domain/src/inbox.ts'
import { buildScopeTree } from '../apps/web/src/lib/scope-tree.ts'

const issues = Array.from({ length: 20_000 }, (_, id) => ({
  id,
  iid: id + 1,
  projectId: 1,
  title: `Issue ${id}`,
  state: 'opened',
  webUrl: '',
  labels: ['bug'],
  assignees: [],
}))
const groups = Array.from({ length: 500 }, (_, id) => ({
  id,
  fullPath: `root/group-${id}`,
  name: `group-${id}`,
}))
const projects = groups.map((group) => ({
  id: group.id,
  path: 'app',
  namespace: group.fullPath,
  groupPath: group.fullPath,
  name: 'app',
  webUrl: '',
}))
for (const [name, run] of [
  ['group 20,000 issues', () => groupIssues(issues)],
  ['sidebar with 500 groups', () => buildScopeTree(groups, projects, issues)],
]) {
  const samples = Array.from({ length: 5 }, () => {
    const started = performance.now()
    run()
    return performance.now() - started
  }).sort((a, b) => a - b)
  console.log(
    `${name}: median ${samples[2].toFixed(1)} ms; min ${samples[0].toFixed(1)} ms; max ${samples[4].toFixed(1)} ms`,
  )
}
