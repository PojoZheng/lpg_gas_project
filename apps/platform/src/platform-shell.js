const PLATFORM_MENU = [
  {
    key: "policy",
    label: "策略发布",
    href: "./policy-release.html",
    icon: '<path d="M6 5h8l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5Z" /><path d="M14 5v4h4" /><path d="M9 13h6M9 16.5h5" />',
  },
  {
    key: "sync",
    label: "安检上报",
    href: "./sync-queue.html",
    icon: '<path d="M5 11a7 7 0 0 1 12-4.6" /><path d="M19 13a7 7 0 0 1-12 4.6" /><path d="M17 4v4h-4" /><path d="M7 20v-4h4" />',
  },
];

function renderAction(action) {
  const variant = action.variant || "secondary";
  const href = String(action.href || "./index.html");
  return `<a class="btn ${variant}" href="${href}">${action.label}</a>`;
}

export function mountPlatformChrome(options = {}) {
  const sidebarTarget =
    typeof options.sidebarTarget === "string"
      ? document.getElementById(options.sidebarTarget)
      : options.sidebarTarget || document.getElementById("platformSidebar");
  const topbarTarget =
    typeof options.topbarTarget === "string"
      ? document.getElementById(options.topbarTarget)
      : options.topbarTarget || document.getElementById("platformTopBar");
  const active = String(options.active || "policy").trim();
  const breadcrumb = String(options.breadcrumb || "策略发布");
  const title = String(options.title || "平台控制台");
  const actions = Array.isArray(options.actions) ? options.actions : [];

  if (sidebarTarget) {
    sidebarTarget.innerHTML = `
      <aside class="side-nav">
        <div class="brand">LPG 平台</div>
        <nav class="menu-group">
          ${PLATFORM_MENU.map((item) => {
            const activeClass = item.key === active ? " active" : "";
            return `
              <a class="menu-link${activeClass}" href="${item.href}">
                <svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg>
                <span>${item.label}</span>
              </a>
            `;
          }).join("")}
        </nav>
      </aside>
    `;
  }

  if (topbarTarget) {
    topbarTarget.innerHTML = `
      <header class="top-bar">
        <div>
          <div class="breadcrumb"><span>平台端</span><span>/</span><span>${breadcrumb}</span></div>
          <h1 class="top-title">${title}</h1>
        </div>
        <div class="top-actions">
          ${actions.map((action) => renderAction(action)).join("")}
        </div>
      </header>
    `;
  }
}
