import { renderIcon } from "./icon-registry.js";

const APP_TABS = [
  {
    key: "workbench",
    label: "首页",
    href: "./workbench.html",
    iconId: "icon-home",
  },
  {
    key: "customer",
    label: "客户",
    href: "./customer-list.html",
    iconId: "icon-customers",
  },
  {
    key: "my",
    label: "我的",
    href: "./my.html",
    iconId: "icon-profile",
  },
];

const LIST_SCROLL_KEY_PREFIX = "delivery-list-scroll-v1:";

export function getPlatformBase() {
  return `${window.location.protocol}//${window.location.hostname}:5175`;
}

export function goToPlatformPage(pathname) {
  const cleanPath = String(pathname || "index.html").replace(/^\.\//, "");
  window.location.href = `${getPlatformBase()}/${cleanPath}`;
}

export function mountAppBottomNav(target, options = {}) {
  const root = typeof target === "string" ? document.getElementById(target) : target;
  if (!root) return null;
  const active = String(options.active || "none").trim();
  const onCurrentClick = options.onCurrentClick || {};

  root.innerHTML = `
    <div class="bottom-nav-wrap">
      <nav class="bottom-nav" aria-label="底部导航">
        ${APP_TABS.map((tab) => {
          const activeClass = tab.key === active ? " active" : "";
          return `
            <button class="nav-btn${activeClass}" type="button" data-app-tab="${tab.key}">
              ${renderIcon(tab.iconId, "nav-icon")}
              <span>${tab.label}</span>
            </button>
          `;
        }).join("")}
      </nav>
    </div>
  `;

  APP_TABS.forEach((tab) => {
    const btn = root.querySelector(`[data-app-tab="${tab.key}"]`);
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (tab.key === active && typeof onCurrentClick[tab.key] === "function") {
        onCurrentClick[tab.key]();
        return;
      }
      window.location.href = tab.href;
    });
  });

  return root;
}

export function goBackOr(fallbackHref = "./workbench.html") {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = fallbackHref;
}

function buildScrollStorageKey(listKey) {
  const raw = String(listKey || window.location.pathname || "list").trim();
  return `${LIST_SCROLL_KEY_PREFIX}${raw}`;
}

export function rememberListScroll(listKey) {
  const key = buildScrollStorageKey(listKey);
  const payload = {
    y: window.scrollY || window.pageYOffset || 0,
    at: Date.now(),
  };
  sessionStorage.setItem(key, JSON.stringify(payload));
}

export function restoreListScroll(listKey, ttlMs = 30 * 60 * 1000) {
  const key = buildScrollStorageKey(listKey);
  const raw = sessionStorage.getItem(key);
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    const y = Number(payload?.y || 0);
    const at = Number(payload?.at || 0);
    if (!Number.isFinite(y) || y < 0) return;
    if (Date.now() - at > ttlMs) {
      sessionStorage.removeItem(key);
      return;
    }
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      setTimeout(() => window.scrollTo(0, y), 60);
    });
  } catch (_err) {
    sessionStorage.removeItem(key);
  }
}

export function navigateWithListScroll(targetHref, listKey) {
  rememberListScroll(listKey);
  window.location.href = targetHref;
}
