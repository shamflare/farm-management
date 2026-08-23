/**
 * أيقونات الواجهة.
 *
 * كلها خطوط SVG بمقاس واحد (24) وسماكة واحدة، وترث لون النص المحيط بها
 * عبر `currentColor` — فلا أيقونة تحتاج لونًا خاصًا، ولا شاشة تحتاج ملف صور.
 * الإيموجي كان يتغيّر شكله بين ويندوز وأندرويد وiOS ويكسر محاذاة السطر؛
 * هذه ثابتة في كل مكان وتكبر مع حجم الخط.
 */

export type IconName = keyof typeof PATHS;

const PATHS = {
  /* --- التنقّل --- */
  home: (
    <>
      <path d="M3 10.6 12 3.5l9 7.1" />
      <path d="M5.5 9.6V20.5h13V9.6" />
      <path d="M9.75 20.5v-6h4.5v6" />
    </>
  ),
  sheep: (
    <>
      <ellipse cx="10.5" cy="12.5" rx="6.5" ry="5" />
      <path d="M7.5 17.3v3M13.5 17.3v3" />
      <circle cx="18.4" cy="9.4" r="2.6" />
      <path d="M20.6 7.6 22 6.2" />
    </>
  ),
  cart: (
    <>
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
      <path d="M2.5 3.5h2.3l2.4 11.3a1.5 1.5 0 0 0 1.5 1.2h8.5a1.5 1.5 0 0 0 1.5-1.2L20.5 7.2H6" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.6v4.8M18 9.6v4.8" />
    </>
  ),
  droplet: <path d="M12 3.2s6 6.1 6 9.9a6 6 0 0 1-12 0c0-3.8 6-9.9 6-9.9z" />,
  wheat: (
    <>
      <path d="M12 21v-8.8" />
      <path d="M12 12.2c-2.4 0-4-1.7-4-4 2.4 0 4 1.7 4 4z" />
      <path d="M12 12.2c2.4 0 4-1.7 4-4-2.4 0-4 1.7-4 4z" />
      <path d="M12 8.2c-2.4 0-4-1.7-4-4 2.4 0 4 1.7 4 4z" />
      <path d="M12 8.2c2.4 0 4-1.7 4-4-2.4 0-4 1.7-4 4z" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H5.5" />
      <circle cx="16.5" cy="14.5" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  building: (
    <>
      <path d="M3 21h18" />
      <path d="M5.5 21V6.4L12 3.5l6.5 2.9V21" />
      <path d="M9.6 21v-4.6h4.8V21" />
      <path d="M9.4 9.6h1.6M13 9.6h1.6M9.4 13h1.6M13 13h1.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M2.6 20a6.4 6.4 0 0 1 12.8 0" />
      <path d="M16.4 5.4a3.3 3.3 0 0 1 0 6.3" />
      <path d="M18 14.3A6.4 6.4 0 0 1 21.4 20" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 3.5v16a1 1 0 0 0 1 1h16" />
      <path d="M7.8 16.6v-4.2M12 16.6V8.4M16.2 16.6v-5.6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.6c0 4.3 3 8.2 7 9.4 4-1.2 7-5.1 7-9.4V6z" />
      <path d="m9.2 12 2 2 3.6-3.9" />
    </>
  ),
  list: (
    <>
      <path d="M8.6 6.5h11.9M8.6 12h11.9M8.6 17.5h11.9" />
      <circle cx="4.3" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.3" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.3" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  blocks: (
    <>
      <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.6" />
      <rect x="13.2" y="3.2" width="7.6" height="7.6" rx="1.6" />
      <rect x="3.2" y="13.2" width="7.6" height="7.6" rx="1.6" />
      <rect x="13.2" y="13.2" width="7.6" height="7.6" rx="1.6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.9 12.1 8.1-8.1M17 6l2.6 2.6M14.6 8.4 17.2 11" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7z" />
      <circle cx="7.9" cy="11.6" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="10.6" cy="7.6" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="15.3" cy="8.3" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2" />
      <path d="M3.5 4.6V9.1H8" />
      <path d="M12 7.6V12l3.1 1.8" />
    </>
  ),

  /* --- الأدوات --- */
  bell: (
    <>
      <path d="M18 8.6a6 6 0 1 0-12 0c0 5.9-2.2 7.4-2.2 7.4h16.4S18 14.5 18 8.6z" />
      <path d="M13.8 19.5a2 2 0 0 1-3.6 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8" />,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronUp: <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />,
  chevronStart: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronEnd: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.7-3.7" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.8v10.7" />
      <path d="m7.6 10.4 4.4 4.4 4.4-4.4" />
      <path d="M4 19.8h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.8" />
      <path d="M7.6 9.2 12 4.8l4.4 4.4" />
      <path d="M4 19.8h16" />
    </>
  ),
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  minus: <path d="M5.2 12h13.6" />,
  check: <path d="m5.2 12.6 5 5 8.6-11" />,
  logout: (
    <>
      <path d="M14.8 4.5h3.7A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5h-3.7" />
      <path d="M9.6 8 5.6 12l4 4" />
      <path d="M5.6 12h9.2" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.4v4.4" />
      <circle cx="12" cy="17" r=".95" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11.2v5.4" />
      <circle cx="12" cy="7.9" r=".95" fill="currentColor" stroke="none" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.6h16" />
      <path d="M9.2 6.6V4.9a1.3 1.3 0 0 1 1.3-1.3h3a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="m6.6 6.6.9 12.4a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l.9-12.4" />
      <path d="M10.5 10.4v6M13.5 10.4v6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20.2h4.3L19.6 8.8a2.1 2.1 0 0 0 0-3l-1.3-1.3a2.1 2.1 0 0 0-3 0L4 15.9z" />
      <path d="m14.6 6.1 3.4 3.4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.2 11.6a8.2 8.2 0 1 1-2.5-5.8" />
      <path d="M20.6 3.6v5.3h-5.3" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8.6V3.6h10v5" />
      <path d="M7 17.2H5.2a2 2 0 0 1-2-2v-4.6a2 2 0 0 1 2-2h13.6a2 2 0 0 1 2 2v4.6a2 2 0 0 1-2 2H17" />
      <path d="M7 14.2h10v6.4H7z" />
    </>
  ),
  filter: <path d="M3.6 5h16.8l-6.6 7.9v6.2l-3.6 1.4v-7.6z" />,
  arrowEnd: (
    <>
      <path d="M4 12h15.5" />
      <path d="m14 6.4 5.6 5.6-5.6 5.6" />
    </>
  ),
  arrowStart: (
    <>
      <path d="M20 12H4.5" />
      <path d="M10 6.4 4.4 12l5.6 5.6" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8.4h14l-3.6-3.6" />
      <path d="M20 15.6H6l3.6 3.6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.1 14.4a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.5 1.5 0 0 0-2.6-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.5 1.5 0 0 0-1.1-2.6H3.6a1.9 1.9 0 1 1 0-3.8h.2a1.5 1.5 0 0 0 1.1-2.6l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.5 1.5 0 0 0 2.6-1.1V3.6a1.9 1.9 0 1 1 3.8 0v.2a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.5 1.5 0 0 0 1.1 2.6h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.5 1.5 0 0 0-1.4.9z" />
    </>
  ),

  /* --- المزرعة والمالية --- */
  coins: (
    <>
      <ellipse cx="12" cy="6.4" rx="7.5" ry="2.9" />
      <path d="M4.5 6.4v5.2c0 1.6 3.4 2.9 7.5 2.9s7.5-1.3 7.5-2.9V6.4" />
      <path d="M4.5 11.6v5.2c0 1.6 3.4 2.9 7.5 2.9s7.5-1.3 7.5-2.9v-5.2" />
    </>
  ),
  box: (
    <>
      <path d="M20.8 8.2 12 3.6 3.2 8.2v7.6l8.8 4.6 8.8-4.6z" />
      <path d="m3.2 8.2 8.8 4.6 8.8-4.6M12 12.8v7.6" />
    </>
  ),
  scale: (
    <>
      <circle cx="12" cy="6.6" r="1.8" />
      <path d="M6.6 20.5h10.8a1.5 1.5 0 0 0 1.5-1.7l-1.3-8a1.5 1.5 0 0 0-1.5-1.3H8.9a1.5 1.5 0 0 0-1.5 1.3l-1.3 8a1.5 1.5 0 0 0 1.5 1.7z" />
    </>
  ),
  pulse: <path d="M2.8 12h4.1l2.6-7.2 4.9 14.4 2.6-7.2h4.2" />,
  heart: (
    <path d="M12 20.4s-7.6-4.7-7.6-9.8a4.3 4.3 0 0 1 7.6-2.8 4.3 4.3 0 0 1 7.6 2.8c0 5.1-7.6 9.8-7.6 9.8z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.2" width="17" height="15.3" rx="2" />
      <path d="M3.5 10.2h17M8.2 3.4v3.6M15.8 3.4v3.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2v5l3.2 1.9" />
    </>
  ),
  file: (
    <>
      <path d="M13.6 3.6H7.2a1.6 1.6 0 0 0-1.6 1.6v13.6a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6V8.4z" />
      <path d="M13.6 3.6v4.8h4.8" />
    </>
  ),
  image: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="m4 17.4 5-4.5 4 3.4 2.7-2.4 4.3 3.9" />
    </>
  ),
  lock: (
    <>
      <rect x="4.6" y="10.2" width="14.8" height="10.3" rx="2" />
      <path d="M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0" />
    </>
  ),
  tag: (
    <>
      <path d="M11.7 3.6H4.6a1 1 0 0 0-1 1v7.1a1 1 0 0 0 .3.7l8.3 8.3a1 1 0 0 0 1.4 0l7.1-7.1a1 1 0 0 0 0-1.4l-8.3-8.3a1 1 0 0 0-.7-.3z" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  trendUp: (
    <>
      <path d="M3.6 17 10 10.6l3.5 3.5 6.9-6.9" />
      <path d="M15.4 7.2h5v5" />
    </>
  ),
  trendDown: (
    <>
      <path d="M3.6 7 10 13.4l3.5-3.5 6.9 6.9" />
      <path d="M15.4 16.8h5v-5" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.4 13.4h4.4l1.4 2.6h5.6l1.4-2.6h4.4" />
      <path d="M6.1 4.6h11.8l2.7 8.8v4.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2v-4.4z" />
    </>
  ),
} as const;

type Props = {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
};

export default function Icon({ name, size, className, strokeWidth = 1.75 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
