export function formatTime(ts) {
  if (!ts) return "未发布";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

export function scopeTypeLabel(value) {
  return value === "company" ? "燃气公司" : "地区";
}

export function statusLabel(value) {
  return value === "active" ? "生效中" : value === "draft" ? "草稿" : "历史";
}

export function inspectionLabel(content) {
  const delivery = content.inspection?.delivery || {};
  if (!delivery.enabled) return "不需要";
  if (String(delivery.mode || "") === "optional") return "可选";
  return "必做";
}

export function scanLabel(content) {
  const scan = content.scan || {};
  if (!scan.enabled) return "不需要";
  if (!scan.required) return "建议";
  return "必须";
}

export function reportTargetLabel(content) {
  const value = String(content.reporting?.mode || "company_first");
  return ({ direct: "直报监管", company_first: "燃气公司转报", hybrid: "上报燃气公司" })[value] || "燃气公司转报";
}

export function normalizeScopeMeta(policy = {}) {
  const scopeType = String(policy.scopeType || "region").trim() === "company" ? "company" : "region";
  const regionCode = String(policy.regionCode || policy.scopeValue || "CN-DEFAULT").trim() || "CN-DEFAULT";
  const regionName = String(policy.content?.regionName || policy.regionName || "全国默认区域").trim() || "全国默认区域";
  const companyName = scopeType === "company" ? String(policy.scopeLabel || "默认燃气公司").trim() || "默认燃气公司" : "当前地区全部配送员";
  return { scopeType, regionCode, regionName, companyName };
}

export function normalizePolicyContent(content = {}) {
  const deliveryEnabled = Boolean(content.inspection?.delivery?.enabled ?? content.safetyCheckRequired ?? true);
  const deliveryModeRaw = String(content.inspection?.delivery?.mode || "required");
  const deliveryMode = !deliveryEnabled ? "disabled" : deliveryModeRaw === "optional" ? "optional" : "required";
  const scanEnabled = Boolean(content.scan?.enabled ?? true);
  const scanRequired = Boolean(content.scan?.required ?? false);
  const reportingMode = String(content.reporting?.mode || "company_first");
  return {
    inspection: { delivery: { enabled: deliveryEnabled, mode: deliveryMode } },
    scan: { enabled: scanEnabled, required: scanRequired },
    reporting: { mode: reportingMode },
  };
}

export function buildPolicyRows(items = []) {
  const grouped = new Map();
  items.forEach((item) => {
    const scope = normalizeScopeMeta(item);
    const key = `${scope.scopeType}:${scope.regionCode}:${scope.companyName}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, item);
      return;
    }
    const currentPriority = current.status === "active" ? 3 : current.status === "draft" ? 2 : 1;
    const nextPriority = item.status === "active" ? 3 : item.status === "draft" ? 2 : 1;
    if (
      nextPriority > currentPriority ||
      (nextPriority === currentPriority &&
        Number(item.publishedAt || 0) > Number(current.publishedAt || 0))
    ) {
      grouped.set(key, item);
    }
  });
  return [...grouped.values()];
}
