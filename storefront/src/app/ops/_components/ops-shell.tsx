"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3, Blocks, ChevronDown, ChevronRight, ChevronsLeft,
  ChevronsRight, ExternalLink, Menu, MessageSquare, Store, X,
} from "lucide-react";
import type { OpsRole } from "@/lib/ops/authorization";
import type { OpsNavigationGroup, OpsNavigationItem } from "@/lib/ops/navigation";
import styles from "./ops-shell.module.css";

const COLLAPSED_KEY = "commerce-ops-sidebar-collapsed";
const ACCENT_KEY = "commerce-admin-navigation-accent";
const ACCENTS = { blue: "#2563eb", slate: "#475569", teal: "#0f766e" } as const;
type Accent = keyof typeof ACCENTS;

const groupIcons = {
  analytics: BarChart3,
  store: Store,
  customers: MessageSquare,
  apps: Blocks,
} as const;

interface Props {
  children: ReactNode;
  groups: readonly OpsNavigationGroup[];
  username: string;
  role: OpsRole;
  dashboardHref: string | null;
}

export function OpsShell({ children, groups, username, role, dashboardHref }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageType = searchParams.get("pageType");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    analytics: true, store: true,
  });
  const [accent, setAccent] = useState<Accent>("blue");

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true");
      const value = window.localStorage.getItem(ACCENT_KEY);
      if (value === "blue" || value === "slate" || value === "teal") setAccent(value);
    } catch {
      // Browser privacy mode must not prevent navigation.
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // The desktop compact preference must never hide labels inside a mobile drawer.
  const compact = collapsed && !mobileViewport;

  const changeCollapsed = (value: boolean) => {
    setCollapsed(value);
    try { window.localStorage.setItem(COLLAPSED_KEY, String(value)); }
    catch { /* In-memory preference still works. */ }
  };
  const changeAccent = (value: Accent) => {
    setAccent(value);
    try { window.localStorage.setItem(ACCENT_KEY, value); }
    catch { /* In-memory preference still works. */ }
  };

  const currentItem = (item: OpsNavigationItem) => {
    const path = item.href.split("?")[0];
    if (item.id === "sites" && pathname.startsWith("/ops/sites/")) return true;
    if (path !== pathname) return false;
    if (item.id === "product-theme") return pageType === "product";
    if (item.id === "themes") return pageType !== "product";
    return true;
  };

  const onGroup = (id: string) => {
    if (compact) {
      changeCollapsed(false);
      setOpenGroups(prev => ({ ...prev, [id]: true }));
    } else {
      setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  return (
    <div
      className={`${styles.shell} ${compact ? styles.compact : ""} ${mobileOpen ? styles.mobileOpen : ""}`}
      style={{ "--ops-nav-accent": ACCENTS[accent] } as CSSProperties}
      data-testid="ops-shell"
    >
      {mobileOpen && (
        <button
          className={styles.backdrop}
          type="button"
          aria-label="关闭菜单遮罩"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={styles.sidebar} aria-label="运营管理导航" data-testid="ops-sidebar">
        <div className={styles.brandRow}>
          <span className={styles.mark} aria-hidden="true">S</span>
          {!compact && (
            <span className={styles.brandName}>SLOER Commerce <span className={styles.adminPill}>Admin</span></span>
          )}
          <button
            type="button"
            className={styles.collapseButton}
            title={compact ? "展开侧边栏" : "收起侧边栏"}
            aria-label={compact ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!compact}
            onClick={() => changeCollapsed(!collapsed)}
          >
            {compact ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
          <button
            type="button"
            className={styles.mobileClose}
            aria-label="关闭运营菜单"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        {!compact && <div className={styles.sectionCaption}>运营中心 · 实际功能页面</div>}
        <nav className={styles.navigation} aria-label="Commerce Ops 功能菜单">
          {groups.map(group => {
            const Icon = groupIcons[group.id];
            const active = group.children.some(currentItem);
            const expanded = Boolean(openGroups[group.id]);

            return (
              <div className={styles.group} key={group.id}>
                <button
                  type="button"
                  aria-expanded={!compact && expanded}
                  aria-controls={!compact && expanded ? `ops-submenu-${group.id}` : undefined}
                  className={`${styles.groupButton} ${active ? styles.groupSelected : ""}`}
                  onClick={() => onGroup(group.id)}
                  title={compact ? group.label : undefined}
                >
                  <Icon size={18} aria-hidden="true" />
                  {!compact && <span className={styles.groupLabel}>{group.label}</span>}
                  {!compact && (expanded ? <ChevronDown size={15} aria-hidden="true" /> :
                    <ChevronRight size={15} aria-hidden="true" />)}
                </button>
                {!compact && expanded && (
                  <div id={`ops-submenu-${group.id}`} className={styles.submenu}>
                    {group.children.map(item => (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={currentItem(item) ? "page" : undefined}
                        className={`${styles.submenuItem} ${currentItem(item) ? styles.itemSelected : ""}`}
                        onClick={() => setMobileOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <footer className={styles.sidebarFooter}>
          {!compact && (
            <>
              <div className={styles.accentRow}>
                <span>后台强调色</span>
                <div className={styles.swatches}>
                  {(Object.keys(ACCENTS) as Accent[]).map(color => (
                    <button
                      key={color}
                      className={`${styles.swatch} ${accent === color ? styles.swatchSelected : ""}`}
                      style={{ backgroundColor: ACCENTS[color] }}
                      type="button"
                      aria-label={`切换${color}后台强调色`}
                      aria-pressed={accent === color}
                      onClick={() => changeAccent(color)}
                    />
                  ))}
                </div>
              </div>
              <div className={styles.viewer}>
                <span className={styles.avatar}>{username.slice(0, 2).toUpperCase()}</span>
                <span className={styles.viewerName}>{username}</span>
                <small>{role === "platform_admin" ? "平台管理" : "品牌只读"}</small>
              </div>
            </>
          )}
          {compact && <span className={styles.avatar} title={username}>{username.slice(0, 2).toUpperCase()}</span>}
        </footer>
      </aside>

      <div className={styles.contentColumn}>
        <header className={styles.topbar}>
          <button className={styles.mobileToggle} type="button" aria-label="打开运营菜单"
            aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <span className={styles.topbarTitle}>运营管理</span>
          <span className={styles.topbarRole}>{role === "platform_admin" ? "Platform Admin" : "Brand Analyst"}</span>
          {dashboardHref && role === "platform_admin" && (
            <a
              className={styles.dashboardLink}
              href={dashboardHref}
              target="_blank"
              rel="noopener noreferrer"
              title="回到 Saleor Dashboard（独立登录）"
            >
              <span>Saleor Dashboard</span>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </header>
        <div className={styles.pageContent}>{children}</div>
      </div>
    </div>
  );
}
