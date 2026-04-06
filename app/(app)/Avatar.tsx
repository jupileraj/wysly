type Size = 'xs' | 'sm' | 'md' | 'lg'

const sizeClasses: Record<Size, string> = {
  xs: 'w-5 h-5 text-xs',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-base',
}

export default function Avatar({ name, avatarUrl, size = 'md' }: {
  name: string
  avatarUrl?: string | null
  size?: Size
}) {
  const cls = sizeClasses[size]
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${cls} rounded-full object-cover shrink-0`}
      />
    )
  }
  return (
    <div className={`${cls} rounded-full bg-dark text-brand font-medium flex items-center justify-center shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
