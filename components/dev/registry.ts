/** Strony demo komponentów: nazwy i pliki jak w brand/reference/components/. */
export const DEMO_LIST = [
  { slug: 'button', file: 'Button.html', title: 'Button' },
  { slug: 'badge', file: 'Badge.html', title: 'Badge' },
  { slug: 'keynumber', file: 'KeyNumber.html', title: 'KeyNumber i Metric' },
  { slug: 'emptystate', file: 'EmptyState.html', title: 'EmptyState' },
  { slug: 'alert', file: 'Alert.html', title: 'Alert' },
  { slug: 'modal', file: 'Modal.html', title: 'Modal' },
  { slug: 'toast', file: 'Toast.html', title: 'Toast' },
  { slug: 'textfield', file: 'TextField.html', title: 'TextField i NumberField' },
  { slug: 'upload', file: 'Upload.html', title: 'Upload i FileChip' },
  { slug: 'tooltip', file: 'Tooltip.html', title: 'Tooltip' },
  { slug: 'appnav', file: 'AppNav.html', title: 'AppNav i MonthSwitcher' },
  { slug: 'datatable', file: 'DataTable.html', title: 'DataTable' },
  { slug: 'pagination', file: 'Pagination.html', title: 'Pagination' },
  { slug: 'circled', file: 'Circled.html', title: 'Circled i Mark' },
  { slug: 'skeleton', file: 'Skeleton.html', title: 'Skeleton i Progress' },
] as const;

export type DemoSlug = (typeof DEMO_LIST)[number]['slug'];
