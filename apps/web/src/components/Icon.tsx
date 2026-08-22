type IconName =
  | 'chevron'
  | 'close'
  | 'copy'
  | 'download'
  | 'edit'
  | 'file'
  | 'folder'
  | 'logout'
  | 'moon'
  | 'plus'
  | 'play'
  | 'pause'
  | 'search'
  | 'sort-down'
  | 'sort-up'
  | 'storage'
  | 'sun'
  | 'trash'
  | 'transfer'
  | 'upload'

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    chevron: <path d="m9 18 6-6-6-6" />,
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v5h5" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4l11-11-4-4L4 16z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    folder: <path d="M3 6h7l2 2h9v12H3z" />,
    logout: (
      <>
        <path d="M10 5H4v14h6" />
        <path d="m14 8 4 4-4 4" />
        <path d="M9 12h9" />
      </>
    ),
    moon: <path d="M20 15a8 8 0 0 1-11-11 9 9 0 1 0 11 11Z" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" />,
    pause: (
      <>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    'sort-down': <path d="m8 10 4 4 4-4" />,
    'sort-up': <path d="m8 14 4-4 4 4" />,
    storage: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 2 4 3 8 3s8-1 8-3V5" />
        <path d="M4 12v7c0 2 4 3 8 3s8-1 8-3v-7" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="m9 7 1-3h4l1 3" />
        <path d="m6 7 1 15h10l1-15" />
      </>
    ),
    transfer: (
      <>
        <path d="m8 3-4 4 4 4" />
        <path d="M4 7h16" />
        <path d="m16 13 4 4-4 4" />
        <path d="M20 17H4" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
