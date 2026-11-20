// The phone tab bar (owner, 2026-11-20: "easier navigation on our mobile web app"): four plain links, server-rendered, shown
// only below 720px (globals.css .tabbar). No script. The ad strip (PhoneStrip) sits above it.
const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  games: (
    <>
      <rect x="3" y="4" width="11" height="15" rx="2" transform="rotate(-8 8.5 11.5)" />
      <rect x="10" y="5" width="11" height="15" rx="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  sell: <path d="M12 3v18M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.2-4.5 3 1.6 2.6 4.5 3.3 4.5 1.5 4.5 3.4-2 3.3-4.5 3.3-4.5-1.2-4.5-3.1" />,
};
const TABS: [string, string, keyof typeof I][] = [
  ["/", "Home", "home"],
  ["/#games", "Games", "games"],
  ["/search", "Search", "search"],
  ["/sell", "Sell", "sell"],
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(([href, label, icon]) => (
        <a key={href} href={href}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {I[icon]}
          </svg>
          {label}
        </a>
      ))}
    </nav>
  );
}
