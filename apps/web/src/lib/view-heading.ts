import { builtinView, decodeViewRef } from '@horizon/domain'

export interface ViewHeading {
  readonly title: string
  readonly subtitle: string
}

/** Title and subtitle shown above the content area for a `view` search param. */
export const activeViewHeading = (viewParam: string): ViewHeading => {
  const ref = decodeViewRef(viewParam)
  switch (ref._tag) {
    case 'Builtin': {
      const view = builtinView(ref.id)
      return { title: view.title, subtitle: view.subtitle }
    }
    case 'Project':
      return { title: ref.path, subtitle: 'projeto' }
    case 'Saved':
      return { title: 'View salva', subtitle: 'filtros salvos por você' }
  }
}
