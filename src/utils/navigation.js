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
      { to: "/mentor-profiles", label: "Mentor profiles", icon: "school" },
      { to: "/bookings", label: "Bookings", icon: "event" },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { to: "/payments", label: "Payments", icon: "payments" },
      { to: "/platform-fees", label: "Platform fees", icon: "percent" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { to: "/categories", label: "Categories", icon: "category" },
      { to: "/hero-slides", label: "Hero slides", icon: "view_carousel" },
    ],
  },
  {
    id: "media",
    label: "Media",
    items: [
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
