interface SwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** A small labelled toggle switch, styled from `@antfu/design` semantic tokens. */
export function Switch(props: SwitchProps) {
  return (
    <label class="inline-flex items-center gap-2 cursor-pointer select-none">
      <span class="relative w-8 h-[18px] rounded-full bg-secondary border border-base transition has-[:checked]:bg-primary-500/40 has-[:checked]:border-primary-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40">
        <input
          type="checkbox"
          class="peer absolute inset-0 m-0 opacity-0 cursor-pointer"
          checked={props.checked}
          onChange={e => props.onChange(e.currentTarget.checked)}
        />
        <span class="absolute top-0.5 left-0.5 size-3 rounded-full bg-neutral-400 pointer-events-none transition peer-checked:translate-x-3.5 peer-checked:bg-primary-500" />
      </span>
      <span class="text-xs color-muted">{props.label}</span>
    </label>
  )
}
