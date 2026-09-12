import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { builtinViews } from '@horizon/domain'
import { describe, expect, it } from 'vitest'
import { AppSidebar, type SidebarGroupItem, type SidebarItem } from '~/components/shell/app-sidebar'
import { buildScopeTree } from '~/lib/scope-tree'
import { renderWithRouter } from './router-harness'

const builtinItems: readonly SidebarItem[] = builtinViews.map((view) => ({
  viewParam: view.id,
  label: view.title,
  icon: view.icon,
}))

const groups: readonly SidebarGroupItem[] = [
  {
    path: 'infra',
    label: 'infra',
    viewParam: 'group:infra',
    count: '3',
    groups: [
      {
        path: 'infra/edge',
        label: 'edge',
        viewParam: 'group:infra/edge',
        count: '1',
        groups: [],
        projects: [{ viewParam: 'project:infra/edge/cdn', label: 'cdn', count: '1' }],
      },
    ],
    projects: [
      { viewParam: 'project:infra/terraform-aws', label: 'terraform-aws', count: '2' },
      { viewParam: 'project:infra/k8s-clusters', label: 'k8s-clusters', count: '1' },
    ],
  },
]

const renderSidebar = (props: Partial<React.ComponentProps<typeof AppSidebar>> = {}, url = '/') =>
  renderWithRouter(
    <AppSidebar activeView="inbox" views={builtinItems} savedViews={[]} groups={[]} {...props} />,
    { url },
  )

describe('AppSidebar', () => {
  it('lists the builtin Views in prototype order', async () => {
    await renderSidebar()
    const names = screen.getAllByRole('link').map((link) => link.textContent)
    expect(names).toEqual(['◍Inbox', '≡Todos os issues', '⊞Por projeto', '◐Atribuídos a mim'])
  })

  it('marks the active View', async () => {
    await renderSidebar({ activeView: 'all' })
    expect(screen.getByRole('link', { name: /Todos os issues/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Inbox/ })).not.toHaveAttribute('aria-current')
  })

  it('links each View through the view search param', async () => {
    await renderSidebar()
    expect(screen.getByRole('link', { name: /Por projeto/ })).toHaveAttribute(
      'href',
      '/?view=by-project',
    )
  })

  it('preserves the other search params when switching View', async () => {
    await renderSidebar({}, '/?mode=kanban&q=terraform')
    expect(screen.getByRole('link', { name: /Todos os issues/ })).toHaveAttribute(
      'href',
      '/?mode=kanban&q=terraform&view=all',
    )
  })

  it('explains how to create a saved View when there is none', async () => {
    await renderSidebar()
    expect(screen.getByText('Aplique filtros e salve para criar uma view.')).toBeInTheDocument()
  })

  it('lists saved Views when they exist', async () => {
    await renderSidebar({
      savedViews: [{ viewParam: 'saved:v1', label: 'Incidentes P1', icon: '◆' }],
    })
    expect(screen.getByRole('link', { name: /Incidentes P1/ })).toHaveAttribute(
      'href',
      '/?view=saved%3Av1',
    )
    expect(
      screen.queryByText('Aplique filtros e salve para criar uma view.'),
    ).not.toBeInTheDocument()
  })

  it('asks for an Escopo when no group is in scope', async () => {
    await renderSidebar()
    expect(screen.getByText('Selecione um Escopo para ver grupos e projetos.')).toBeInTheDocument()
  })

  it('shows standalone projects as navigable project rows', async () => {
    const tree = buildScopeTree(
      [],
      [
        {
          id: 7,
          path: 'horizon',
          name: 'Horizon',
          namespace: 'henrique',
          webUrl: 'https://gitlab.example.com/henrique/horizon',
        },
      ],
      [{ id: 11, iid: 1, projectId: 7, title: 'Issue', state: 'opened', webUrl: '#', assignees: [], labels: [] }],
    )

    await renderSidebar({
      groups: tree.groups,
      standaloneProjects: tree.standaloneProjects,
    })

    expect(screen.getByRole('link', { name: /horizon/ })).toHaveAttribute(
      'href',
      '/?view=project%3Ahenrique%2Fhorizon',
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('Selecione um Escopo para ver grupos e projetos.')).not.toBeInTheDocument()
  })

  it('shows groups with their projects and counts, and collapses them', async () => {
    await renderSidebar({ groups })
    expect(screen.getByText('infra/')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /terraform-aws/ })).toHaveAttribute(
      'href',
      '/?view=project%3Ainfra%2Fterraform-aws',
    )
    expect(screen.getByText('2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Recolher infra' }))

    expect(screen.queryByRole('link', { name: /terraform-aws/ })).not.toBeInTheDocument()
  })

  it('navigates to a group View when the group name is clicked', async () => {
    await renderSidebar({ groups })
    expect(screen.getByRole('link', { name: /infra\// })).toHaveAttribute(
      'href',
      '/?view=group%3Ainfra',
    )
  })

  it('nests subgroups under their parent group', async () => {
    await renderSidebar({ groups })
    expect(screen.getByRole('link', { name: /edge\// })).toHaveAttribute(
      'href',
      '/?view=group%3Ainfra%2Fedge',
    )
  })
})
