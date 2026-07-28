import { tab, tabsList } from '../../design'

export interface TabItem<T extends string = string> {
  value: T
  label: string
  icon?: string
}

export interface TabsProps<T extends string = string> {
  'items': readonly TabItem<T>[]
  'value': T
  'onChange': (value: T) => void
  'aria-label': string
  'class'?: string
}

/** The one shared segmented view-selector every surface uses. */
export function Tabs<T extends string = string>({ items, value, onChange, 'aria-label': label, class: extra }: TabsProps<T>) {
  return (
    <div class={tabsList(extra)} role="tablist" aria-label={label}>
      {items.map(item => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          data-state={value === item.value ? 'active' : 'inactive'}
          class={tab()}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <span class={item.icon} />}
          {item.label}
        </button>
      ))}
    </div>
  )
}
