"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Home01Icon,
  Menu01Icon,
  PlusSignIcon,
  Store01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { adminNavigation, getAdminDestination } from "@/lib/admin-navigation";
import type { IconSvgElement } from "@hugeicons/react";

type AdminShellProps = { children: React.ReactNode };

function Icon({ icon, className }: { icon: IconSvgElement; className?: string }) {
  return <HugeiconsIcon className={className} icon={icon} aria-hidden="true" />;
}

export default function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>(["Sales", "Catalogue"]);
  const [collapsedPopover, setCollapsedPopover] = useState<{ label: string; top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const destination = getAdminDestination(pathname);

  useEffect(() => {
    setCollapsedPopover(null);
    const activeSection = adminNavigation.find((section) =>
      "children" in section && section.children.some((item) => item.href === pathname),
    );
    if (activeSection && "children" in activeSection) {
      setExpanded((sections) => sections.includes(activeSection.label) ? sections : [...sections, activeSection.label]);
    }
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstFrame = window.requestAnimationFrame(() => {
      sidebarRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = [...sidebarRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!collapsedPopover) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCollapsedPopover(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) setCollapsedPopover(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [collapsedPopover]);

  function toggleSection(label: string, trigger: HTMLButtonElement) {
    if (collapsed) {
      setCollapsedPopover((current) => {
        if (current?.label === label) return null;
        const triggerRect = trigger.getBoundingClientRect();
        const menuHeight = Math.min(window.innerHeight - 16, 230);
        const top = Math.max(8, Math.min(triggerRect.top, window.innerHeight - menuHeight - 8));
        const menuWidth = 236;
        const left = Math.max(8, Math.min(triggerRect.right + 8, window.innerWidth - menuWidth - 8));
        return { label, top, left };
      });
      return;
    }
    setExpanded((sections) => sections.includes(label)
      ? sections.filter((section) => section !== label)
      : [...sections, label]);
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  function openMobile() {
    setCollapsed(false);
    setCollapsedPopover(null);
    setMobileOpen(true);
  }

  return (
    <div className={`admin-shell${collapsed ? " admin-shell--collapsed" : ""}${mobileOpen ? " admin-shell--mobile-open" : ""}`}>
      {mobileOpen && <button className="admin-drawer-scrim" type="button" aria-label="Close admin menu" onClick={closeMobile} />}
      <aside
        className="admin-sidebar"
        aria-label="Super admin navigation"
        aria-modal={mobileOpen ? true : undefined}
        role={mobileOpen ? "dialog" : undefined}
        ref={sidebarRef}
      >
        <div className="admin-sidebar__brand-row">
          <Link className="admin-brand" href={"/admin" as Route} onClick={closeMobile} aria-label="BASNY admin home">
            <span className="admin-brand__monogram">B</span>
            <span className="admin-brand__copy"><strong>BASNY</strong><small>CONTROL ROOM</small></span>
          </Link>
          <button className="admin-icon-button admin-sidebar__close" type="button" onClick={closeMobile} aria-label="Close navigation">
            <Icon icon={Cancel01Icon} />
          </button>
          <button
            className="admin-icon-button admin-sidebar__collapse"
            type="button"
            onClick={() => { setCollapsed((value) => !value); setCollapsedPopover(null); }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon icon={collapsed ? ArrowRight01Icon : ArrowLeft01Icon} />
          </button>
        </div>

        <Link className="admin-create-action" href={"/admin/sales/point-of-sale" as Route} onClick={closeMobile} title="Open point of sale">
          <span className="admin-create-action__icon"><Icon icon={PlusSignIcon} /></span>
          <span className="admin-create-action__label">New sale</span>
          <span className="admin-create-action__hint">POS</span>
        </Link>

        <nav className="admin-nav" id="admin-navigation" aria-label="Admin sections">
          {adminNavigation.map((section) => {
            if (!("children" in section)) {
              const active = pathname === section.href;
              return (
                <Link
                  className={`admin-nav__link${active ? " is-active" : ""}`}
                  href={section.href as Route}
                  key={section.label}
                  onClick={() => { closeMobile(); setCollapsedPopover(null); }}
                  title={collapsed ? section.label : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon icon={section.icon} />
                  <span>{section.label}</span>
                </Link>
              );
            }

            const isExpanded = expanded.includes(section.label);
            const showChildren = collapsed ? collapsedPopover?.label === section.label : isExpanded;
            const hasActiveChild = section.children.some((item) => pathname === item.href);
            return (
              <div className={`admin-nav-group${hasActiveChild ? " has-active-child" : ""}`} key={section.label}>
                <button
                  className="admin-nav-group__toggle"
                  type="button"
                  onClick={(event) => toggleSection(section.label, event.currentTarget)}
                  aria-expanded={showChildren}
                  aria-controls={showChildren ? `admin-nav-${section.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined}
                  title={collapsed ? section.label : undefined}
                >
                  <Icon icon={section.icon} />
                  <span>{section.label}</span>
                  <Icon className="admin-nav-group__chevron" icon={showChildren ? ArrowDown01Icon : ArrowRight01Icon} />
                </button>
                {showChildren && (
                  <div
                    className="admin-nav-group__items"
                    id={`admin-nav-${section.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    style={collapsed ? { top: collapsedPopover?.top, left: collapsedPopover?.left } : undefined}
                  >
                    {collapsed && <span className="admin-nav-group__popover-heading">{section.label}</span>}
                    {section.children.map((item) => {
                      const active = pathname === item.href;
                      return (
                        <Link
                          className={`admin-nav__sublink${active ? " is-active" : ""}`}
                          href={item.href as Route}
                          key={item.href}
                          onClick={() => { closeMobile(); setCollapsedPopover(null); }}
                          aria-current={active ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                        >
                          <span className="admin-nav__dot" aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="admin-sidebar__bottom">
          <div className="admin-sidebar__rule" />
          <Link className="admin-store-link" href={"/" as Route} title="View storefront">
            <span className="admin-store-link__icon"><Icon icon={Store01Icon} /></span>
            <span className="admin-store-link__copy"><strong>View storefront</strong><small>BASNY online store</small></span>
            <span className="admin-store-link__arrow" aria-hidden="true">↗</span>
          </Link>
          <div className="admin-profile">
            <span className="admin-profile__avatar" aria-hidden="true">B</span>
            <span className="admin-profile__copy"><strong>Super admin</strong><small>Full workspace access</small></span>
            <span className="admin-profile__chevron" aria-hidden="true">···</span>
          </div>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-icon-button admin-mobile-menu"
            type="button"
            onClick={openMobile}
            ref={menuButtonRef}
            aria-label="Open admin menu"
            aria-expanded={mobileOpen}
            aria-controls="admin-navigation"
          >
            <Icon icon={Menu01Icon} />
          </button>
          <div className="admin-topbar__crumb"><span>Admin</span><span aria-hidden="true">/</span><strong>{destination.label}</strong></div>
          <div className="admin-topbar__right"><span className="admin-topbar__location">Accra, Ghana</span><span className="admin-profile__avatar admin-profile__avatar--top" aria-hidden="true">B</span></div>
        </header>
        <main className="admin-content" id="admin-content" tabIndex={-1}>{children}</main>
      </section>
    </div>
  );
}
