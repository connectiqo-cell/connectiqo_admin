import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { NAV_GROUPS } from "../../utils/navigation.js";
import { SearchBar } from "../common/SearchBar.jsx";

export function SidebarNav({ onNavigate }) {
  const [menuQuery, setMenuQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    if (!q) return NAV_GROUPS;

    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.to.toLowerCase().includes(q.replace(/\s+/g, "-"))
      ),
    })).filter((group) => group.items.length > 0);
  }, [menuQuery]);

  const hasResults = filteredGroups.length > 0;

  return (
    <nav className="admin-sidebar__nav" aria-label="Main navigation">
      <div className="admin-sidebar__menu-search">
        <SearchBar
          size="sm"
          value={menuQuery}
          onChange={(e) => setMenuQuery(e.target.value)}
          placeholder="Search menu…"
          aria-label="Search navigation menu"
        />
      </div>
      <div className="admin-sidebar__nav-scroll">
        {!hasResults ? (
          <p className="sidebar-nav-empty">No menu items match your search.</p>
        ) : (
          filteredGroups.map((group) => (
            <section
              key={group.id}
              className="sidebar-nav-group"
              aria-labelledby={`nav-group-${group.id}`}
            >
              <h2 id={`nav-group-${group.id}`} className="sidebar-nav-group__label">
                {group.label}
              </h2>
              <ul className="sidebar-nav-group__list">
                {group.items.map((item) => (
                  <li key={item.to} className="sidebar-nav-group__item">
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        `sidebar-link${isActive ? " sidebar-link--active" : ""}`
                      }
                      onClick={onNavigate}
                    >
                      <span className="sidebar-link__icon-wrap" aria-hidden="true">
                        <span className="material-icons sidebar-link__icon">{item.icon}</span>
                      </span>
                      <span className="sidebar-link__label">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </nav>
  );
}
