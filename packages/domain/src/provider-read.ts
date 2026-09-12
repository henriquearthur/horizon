import type { ScopeSelection } from './scope.ts'
import type { ProviderGroup, ProviderProject, ProviderUser } from './provider.ts'
export type { ProviderGroup, ProviderProject, ProviderUser } from './provider.ts'

export interface ProviderLabel { readonly id: number; readonly name: string; readonly color?: string }
export interface ProviderIssue {
  readonly id: number; readonly iid: number; readonly projectId: number; readonly title: string
  readonly description?: string; readonly state: 'opened' | 'closed'; readonly webUrl: string
  readonly author?: ProviderUser; readonly assignees: readonly ProviderUser[]; readonly labels: readonly string[]
  readonly status?: string; readonly priority?: string
}
export interface ProviderReadPage<T> { readonly items: readonly T[]; readonly nextPage?: number }
export interface ProviderReadContract {
  listGroups(page?: number): Promise<ProviderReadPage<ProviderGroup>>
  listProjects(page?: number): Promise<ProviderReadPage<ProviderProject>>
  listUsers(projectId: number, page?: number): Promise<ProviderReadPage<ProviderUser>>
  listLabels(projectId: number, page?: number): Promise<ProviderReadPage<ProviderLabel>>
  listIssues(projectId: number, page?: number): Promise<ProviderReadPage<ProviderIssue>>
  readScope(scope: ScopeSelection): Promise<{ groups: readonly ProviderGroup[]; projects: readonly ProviderProject[]; issues: readonly ProviderIssue[] }>
}

const user = (v: any): ProviderUser | undefined => typeof v?.id === 'number' && typeof v?.username === 'string' ? { id: v.id, username: v.username, name: typeof v.name === 'string' ? v.name : v.username, ...(typeof v.avatar_url === 'string' ? { avatarUrl: v.avatar_url } : {}) } : undefined
const page = <T>(items: readonly T[], header: string | null): ProviderReadPage<T> => ({ items, ...(header && Number(header) > 0 ? { nextPage: Number(header) } : {}) })

export class GitLabReadProvider implements ProviderReadContract {
  constructor(private readonly connection: { url: string; token: string }, private readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, pageNo = 1): Promise<{ value: any; next: string | null }> {
    const base = new URL(this.connection.url); base.pathname = base.pathname.replace(/\/$/, '')
    const url = new URL(`${base.pathname}/api/v4/${path}`, base); url.searchParams.set('page', String(pageNo)); url.searchParams.set('per_page', '100')
    const response = await this.fetcher(url, { headers: { 'PRIVATE-TOKEN': this.connection.token, Accept: 'application/json' } })
    if (!response.ok) throw new Error(response.status === 403 ? 'Token sem permissão para acessar o GitLab.' : `GitLab respondeu ${response.status}.`)
    return { value: await response.json(), next: response.headers.get('x-next-page') }
  }
  async listGroups(p = 1) { const r = await this.request('groups?min_access_level=10', p); return page((r.value as any[]).flatMap(v => typeof v.id === 'number' && typeof v.full_path === 'string' && typeof v.name === 'string' ? [{ id:v.id, fullPath:v.full_path, name:v.name }] : []), r.next) }
  async listProjects(p = 1) { const r = await this.request('projects?membership=true&simple=true', p); return page((r.value as any[]).flatMap(v => typeof v.id === 'number' && typeof v.path_with_namespace === 'string' && typeof v.name === 'string' && typeof v.web_url === 'string' ? [{ id:v.id, path:typeof v.path === 'string' ? v.path : v.path_with_namespace.split('/').at(-1)!, name:v.name, namespace:v.path_with_namespace.slice(0, -(String(v.path ?? v.name).length + 1)), webUrl:v.web_url, groupPath:v.path_with_namespace.split('/').slice(0,-1).join('/') }] : []), r.next) }
  async listUsers(id: number, p = 1) { const r = await this.request(`projects/${id}/members/all`, p); return page((r.value as any[]).flatMap(v => { const u = user(v); return u ? [u] : [] }), r.next) }
  async listLabels(id: number, p = 1) { const r = await this.request(`projects/${id}/labels`, p); return page((r.value as any[]).flatMap(v => typeof v.id === 'number' && typeof v.name === 'string' ? [{ id:v.id, name:v.name, ...(typeof v.color === 'string' ? { color:v.color } : {}) }] : []), r.next) }
  async listIssues(id: number, p = 1) { const r = await this.request(`projects/${id}/issues?scope=all`, p); return page((r.value as any[]).flatMap(v => { if (!(typeof v.id === 'number' && typeof v.iid === 'number' && typeof v.title === 'string' && typeof v.state === 'string' && typeof v.web_url === 'string')) return []; const a = user(v.author); return [{ id:v.id, iid:v.iid, projectId:id, title:v.title, ...(typeof v.description === 'string' ? { description:v.description } : {}), state:v.state, webUrl:v.web_url, ...(a ? { author:a } : {}), assignees:(v.assignees ?? []).flatMap((x: any) => { const u = user(x); return u ? [u] : [] }), labels:Array.isArray(v.labels) ? v.labels.filter((x: unknown): x is string => typeof x === 'string') : [] }] }), r.next) }
  async readScope(scope: ScopeSelection) { const projects: ProviderProject[] = []; for (let p=1;;p++){ const r=await this.listProjects(p); projects.push(...r.items.filter(x=>scope.projects.includes(x.id)||scope.followGroups.some(g=>x.groupPath===g||x.groupPath?.startsWith(`${g}/`)))); if(!r.nextPage) break } const issues: ProviderIssue[]=[]; for(const project of projects) for(let p=1;;p++){const r=await this.listIssues(project.id,p); issues.push(...r.items); if(!r.nextPage) break} return { groups: [], projects, issues } }
}
