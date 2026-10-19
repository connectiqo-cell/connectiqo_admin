export const NAV_GROUPS = [
  {
    id: "main",
    label: "Main",
    items: [{ to: "/", label: "Overview", icon: "dashboard" }],
  },
  {
    id: "people",
    label: "People",
    items: [
      { to: "/users", label: "Profiles", icon: "people" },
      { to: "/reports", label: "Reports", icon: "flag" },
      { to: "/bookings", label: "Bookings", icon: "event" },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { to: "/payments", label: "Payments", icon: "payments" },
      { to: "/withdrawals", label: "Withdrawals", icon: "account_balance_wallet" },
      { to: "/platform-fees", label: "Platform fees", icon: "percent" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { to: "/categories", label: "Categories", icon: "category" },
      { to: "/hero-slides", label: "Hero slides", icon: "view_carousel" },
      { to: "/trending", label: "Trending creators", icon: "local_fire_department" },
    ],
  },
  {
    id: "media",
    label: "Media",
    items: [
      { to: "/videos", label: "Uploaded videos", icon: "movie" },
      { to: "/sessions", label: "Sessions", icon: "videocam" },
      { to: "/recordings", label: "Recordings", icon: "fiber_manual_record" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { to: "/database", label: "Database explorer", icon: "storage" },
      { to: "/audit-logs", label: "Audit logs", icon: "history" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function getNavItemByPath(pathname) {
  return NAV_ITEMS.find((item) => item.to === pathname);
}

export const TABLE_MAPPINGS = {
  users: "profiles",
  bookings: "bookings",
};
