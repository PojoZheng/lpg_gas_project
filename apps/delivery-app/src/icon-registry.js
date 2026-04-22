export function renderIcon(iconId, className = "nav-icon") {
  const safeIconId = String(iconId || "").trim();
  const safeClassName = String(className || "nav-icon").trim();
  return `<svg class="${safeClassName}" viewBox="0 0 24 24" aria-hidden="true"><use href="./icon-sprite.svg#${safeIconId}"></use></svg>`;
}
