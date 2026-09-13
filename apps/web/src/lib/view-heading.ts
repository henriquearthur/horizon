import { builtinView, type ViewRef } from '@horizon/domain'

export interface ViewHeading {
  readonly title: string
  readonly subtitle: string
}

/**
 * Title and subtitle shown above the content area for a View. A Projeto is
 * Horizon-owned, so its name has to be handed in by the caller.
 */
export const activeViewHeading = (view: ViewRef, initiativeName?: string): ViewHeading => {
  switch (view._tag) {
    case 'Builtin': {
      const builtin = builtinView(view.id)
      return { title: builtin.title, subtitle: builtin.subtitle }
    }
    case 'Group':
      return { title: `${view.path}/`, subtitle: 'grupo e subgrupos' }
    case 'Project':
      return { title: view.path, subtitle: 'projeto' }
    case 'Saved':
      return { title: 'View salva', subtitle: 'filtros salvos por você' }
    case 'Initiative':
      return {
        title: initiativeName ?? view.id,
        subtitle: 'projeto, entre repositórios e grupos',
      }
  }
}
