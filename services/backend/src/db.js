const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH =
  process.env.TRELLIS_DB_PATH ||
  path.join(
    __dirname,
    "..",
    "data",
    String(process.env.PORT || "3100") === "3100" ? "app.sqlite" : `app-${String(process.env.PORT || "3100")}.sqlite`
  );

let dbInstance = null;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getDb() {
  if (dbInstance) return dbInstance;
  ensureDir(DB_PATH);
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS auth_maps (
      bucket TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (bucket, key)
    );

    CREATE TABLE IF NOT EXISTS customer_accounts (
      customer_id TEXT PRIMARY KEY,
      owed_amount REAL NOT NULL,
      owed_empty_count INTEGER NOT NULL,
      collection_status TEXT NOT NULL,
      collection_note TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      debt_since_at INTEGER NOT NULL,
      last_collection_at INTEGER NOT NULL,
      collection_history_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_state (
      name TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_collection_items (
      collection_name TEXT NOT NULL,
      item_key TEXT NOT NULL,
      sort_index INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection_name, item_key)
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      customer_id TEXT,
      order_status TEXT,
      order_type TEXT,
      created_at INTEGER,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_entries (
      entry_id TEXT PRIMARY KEY,
      order_id TEXT,
      customer_id TEXT,
      posted_at INTEGER,
      status TEXT,
      source TEXT,
      amount REAL,
      received_amount REAL,
      payment_method TEXT,
      updated_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS safety_records (
      safety_id TEXT PRIMARY KEY,
      order_id TEXT,
      status TEXT,
      checked_at INTEGER,
      has_abnormal INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_queue_items (
      offline_id TEXT PRIMARY KEY,
      entity_type TEXT,
      action TEXT,
      sync_status TEXT,
      created_at INTEGER,
      updated_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);
  dbInstance = db;
  return dbInstance;
}

function withTransaction(fn) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const out = fn(db);
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_rollbackErr) {}
    throw err;
  }
}

function hasAuthState() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(1) AS count FROM auth_maps").get();
  return Number(row?.count || 0) > 0;
}

function replaceAuthState(payload = {}) {
  const now = Date.now();
  const buckets = {
    codes: Array.isArray(payload.codes) ? payload.codes : [],
    users: Array.isArray(payload.users) ? payload.users : [],
    accessTokens: Array.isArray(payload.accessTokens) ? payload.accessTokens : [],
    refreshTokens: Array.isArray(payload.refreshTokens) ? payload.refreshTokens : [],
    sendCodeStats: Array.isArray(payload.sendCodeStats) ? payload.sendCodeStats : [],
    loginFailureStats: Array.isArray(payload.loginFailureStats) ? payload.loginFailureStats : [],
  };
  withTransaction((db) => {
    db.prepare("DELETE FROM auth_maps").run();
    const insert = db.prepare(
      "INSERT INTO auth_maps (bucket, key, value_json, updated_at) VALUES (?, ?, ?, ?)"
    );
    Object.entries(buckets).forEach(([bucket, entries]) => {
      entries.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return;
        insert.run(bucket, String(entry[0]), JSON.stringify(entry[1]), now);
      });
    });
  });
}

function loadAuthState() {
  const db = getDb();
  const rows = db
    .prepare("SELECT bucket, key, value_json FROM auth_maps ORDER BY bucket, key")
    .all();
  const payload = {
    codes: [],
    users: [],
    accessTokens: [],
    refreshTokens: [],
    sendCodeStats: [],
    loginFailureStats: [],
  };
  rows.forEach((row) => {
    if (!Object.prototype.hasOwnProperty.call(payload, row.bucket)) return;
    try {
      payload[row.bucket].push([row.key, JSON.parse(row.value_json)]);
    } catch (_err) {}
  });
  return payload;
}

function hasCustomerLedger() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(1) AS count FROM customer_accounts").get();
  return Number(row?.count || 0) > 0;
}

function replaceCustomerLedger(accounts = []) {
  withTransaction((db) => {
    db.prepare("DELETE FROM customer_accounts").run();
    const insert = db.prepare(`
      INSERT INTO customer_accounts (
        customer_id,
        owed_amount,
        owed_empty_count,
        collection_status,
        collection_note,
        updated_at,
        debt_since_at,
        last_collection_at,
        collection_history_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    accounts.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return;
      const customerId = String(entry[0] || "").trim();
      const row = entry[1] || {};
      if (!customerId) return;
      insert.run(
        customerId,
        Number(row.owedAmount || 0),
        Number(row.owedEmptyCount || 0),
        String(row.collectionStatus || "none"),
        String(row.collectionNote || ""),
        Number(row.updatedAt || 0),
        Number(row.debtSinceAt || 0),
        Number(row.lastCollectionAt || 0),
        JSON.stringify(Array.isArray(row.collectionHistory) ? row.collectionHistory : [])
      );
    });
  });
}

function loadCustomerLedger() {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        customer_id,
        owed_amount,
        owed_empty_count,
        collection_status,
        collection_note,
        updated_at,
        debt_since_at,
        last_collection_at,
        collection_history_json
      FROM customer_accounts
      ORDER BY customer_id
    `)
    .all()
    .map((row) => {
      let history = [];
      try {
        history = JSON.parse(row.collection_history_json || "[]");
      } catch (_err) {}
      return [
        row.customer_id,
        {
          customerId: row.customer_id,
          owedAmount: Number(row.owed_amount || 0),
          owedEmptyCount: Number(row.owed_empty_count || 0),
          collectionStatus: String(row.collection_status || "none"),
          collectionNote: String(row.collection_note || ""),
          updatedAt: Number(row.updated_at || 0),
          debtSinceAt: Number(row.debt_since_at || 0),
          lastCollectionAt: Number(row.last_collection_at || 0),
          collectionHistory: Array.isArray(history) ? history : [],
        },
      ];
    });
}

function hasRuntimeState(name = "main") {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(1) AS count FROM runtime_state WHERE name = ?").get(name);
  return Number(row?.count || 0) > 0;
}

function saveRuntimeState(name, payload) {
  const db = getDb();
  db.prepare(`
    INSERT INTO runtime_state (name, payload_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(name, JSON.stringify(payload || {}), Date.now());
}

function loadRuntimeState(name = "main") {
  const db = getDb();
  const row = db.prepare("SELECT payload_json FROM runtime_state WHERE name = ?").get(name);
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_err) {
    return null;
  }
}

const RUNTIME_COLLECTION_CONFIG = [
  { name: "mockCustomers", getKey: (item, index) => String(item?.id || `customer-${index}`) },
  { name: "inventoryBySpec", getEntries: (payload) => Object.entries(payload?.inventoryBySpec || {}), entryMode: true },
  { name: "inventoryLogs", getKey: (item, index) => String(item?.id || `inventory-log-${index}`) },
  { name: "policyVersions", getKey: (item, index) => String(item?.version || `policy-${index}`) },
  { name: "policyAuditLogs", getKey: (item, index) => String(item?.logId || item?.version || `policy-audit-${index}`) },
  {
    name: "businessRulesEntries",
    getEntries: (payload) => Array.isArray(payload?.businessRulesEntries) ? payload.businessRulesEntries : [],
    entryMode: true,
  },
  { name: "exchangeRecords", getKey: (item, index) => String(item?.id || `exchange-${index}`) },
  { name: "returnRecords", getKey: (item, index) => String(item?.returnId || item?.id || `return-${index}`) },
  { name: "dailyCloseRecords", getKey: (item, index) => String(item?.closeId || item?.date || `daily-close-${index}`) },
  { name: "debtReminderRecords", getKey: (item, index) => String(item?.reminderId || `debt-reminder-${index}`) },
  { name: "debtRepaymentRecords", getKey: (item, index) => String(item?.repaymentId || `debt-repayment-${index}`) },
];

function hasRuntimeCollections() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(1) AS count FROM runtime_collection_items").get();
  return Number(row?.count || 0) > 0;
}

function replaceRuntimeCollections(payload = {}) {
  const now = Date.now();
  withTransaction((db) => {
    db.prepare("DELETE FROM runtime_collection_items").run();
    const insert = db.prepare(`
      INSERT INTO runtime_collection_items (
        collection_name,
        item_key,
        sort_index,
        payload_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
    RUNTIME_COLLECTION_CONFIG.forEach((config) => {
      const usedKeys = new Set();
      const items = config.entryMode
        ? config.getEntries(payload)
        : Array.isArray(payload?.[config.name]) ? payload[config.name] : [];
      items.forEach((item, index) => {
        let itemKey = "";
        let rowPayload = item;
        if (config.entryMode) {
          if (!Array.isArray(item) || item.length < 2) return;
          itemKey = String(item[0] || "").trim();
          rowPayload = item[1];
        } else {
          itemKey = String(config.getKey(item, index) || "").trim();
        }
        if (!itemKey) return;
        const baseKey = itemKey;
        let nextKey = baseKey;
        let suffix = 1;
        while (usedKeys.has(nextKey)) {
          nextKey = `${baseKey}::${suffix}`;
          suffix += 1;
        }
        usedKeys.add(nextKey);
        insert.run(config.name, nextKey, index, JSON.stringify(rowPayload), now);
      });
    });
  });
}

function loadRuntimeCollections() {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT collection_name, item_key, sort_index, payload_json
      FROM runtime_collection_items
      ORDER BY collection_name, sort_index ASC
    `)
    .all();
  const payload = {
    mockCustomers: [],
    inventoryBySpec: {},
    inventoryLogs: [],
    policyVersions: [],
    policyAuditLogs: [],
    businessRulesEntries: [],
    exchangeRecords: [],
    returnRecords: [],
    dailyCloseRecords: [],
    debtReminderRecords: [],
    debtRepaymentRecords: [],
  };
  const entryModeNames = new Set(
    RUNTIME_COLLECTION_CONFIG.filter((config) => config.entryMode).map((config) => config.name)
  );
  rows.forEach((row) => {
    if (!Object.prototype.hasOwnProperty.call(payload, row.collection_name)) return;
    let value = null;
    try {
      value = JSON.parse(row.payload_json);
    } catch (_err) {
      return;
    }
    if (row.collection_name === "inventoryBySpec") {
      payload.inventoryBySpec[row.item_key] = value;
      return;
    }
    if (entryModeNames.has(row.collection_name)) {
      payload[row.collection_name].push([row.item_key, value]);
      return;
    }
    payload[row.collection_name].push(value);
  });
  return payload;
}

function hasRows(tableName) {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(1) AS count FROM ${tableName}`).get();
  return Number(row?.count || 0) > 0;
}

function replaceOrders(orders = []) {
  const now = Date.now();
  withTransaction((db) => {
    db.prepare("DELETE FROM orders").run();
    const insert = db.prepare(`
      INSERT INTO orders (
        order_id, customer_id, order_status, order_type, created_at, completed_at, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    orders.forEach((order, index) => {
      const orderId = String(order?.orderId || `order-${index}`).trim();
      if (!orderId) return;
      insert.run(
        orderId,
        String(order?.customerId || ""),
        String(order?.orderStatus || ""),
        String(order?.orderType || ""),
        Number(order?.createdAt || 0),
        Number(order?.completedAt || 0),
        now,
        JSON.stringify(order || {})
      );
    });
  });
}

function loadOrders() {
  const db = getDb();
  return db
    .prepare("SELECT payload_json FROM orders ORDER BY created_at ASC, order_id ASC")
    .all()
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function findOrderById(orderId) {
  const db = getDb();
  const row = db.prepare("SELECT payload_json FROM orders WHERE order_id = ?").get(String(orderId || ""));
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_err) {
    return null;
  }
}

function listOrders(filters = {}) {
  const clauses = [];
  const params = [];
  const customerId = String(filters.customerId || "").trim();
  const status = String(filters.status || "").trim();
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  if (customerId) {
    clauses.push("customer_id = ?");
    params.push(customerId);
  }
  if (status && status !== "all") {
    clauses.push("order_status = ?");
    params.push(status);
  }
  let sql = "SELECT payload_json FROM orders";
  if (clauses.length) {
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }
  sql += " ORDER BY created_at DESC, order_id DESC";
  const db = getDb();
  const rows = db.prepare(sql).all(...params);
  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (_err) {
        return null;
      }
    })
    .filter((row) => {
      if (!row) return false;
      if (!keyword) return true;
      const haystack = [
        String(row.orderId || ""),
        String(row.customerName || ""),
        String(row.address || ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
}

function replaceFinanceEntries(entries = []) {
  const now = Date.now();
  withTransaction((db) => {
    db.prepare("DELETE FROM finance_entries").run();
    const insert = db.prepare(`
      INSERT INTO finance_entries (
        entry_id, order_id, customer_id, posted_at, status, source, amount, received_amount, payment_method, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const usedKeys = new Set();
    entries.forEach((entry, index) => {
      const baseKey = String(entry?.entryId || entry?.id || `finance-${index}`).trim();
      if (!baseKey) return;
      let entryId = baseKey;
      let suffix = 1;
      while (usedKeys.has(entryId)) {
        entryId = `${baseKey}::${suffix}`;
        suffix += 1;
      }
      usedKeys.add(entryId);
      insert.run(
        entryId,
        String(entry?.orderId || ""),
        String(entry?.customerId || ""),
        Number(entry?.postedAt || entry?.createdAt || 0),
        String(entry?.status || ""),
        String(entry?.source || entry?.type || ""),
        Number(entry?.amount || 0),
        Number(entry?.receivedAmount || 0),
        String(entry?.paymentMethod || entry?.method || ""),
        now,
        JSON.stringify(entry || {})
      );
    });
  });
}

function loadFinanceEntries() {
  const db = getDb();
  return db
    .prepare("SELECT payload_json FROM finance_entries ORDER BY posted_at ASC, entry_id ASC")
    .all()
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function listFinanceEntriesInRange(startAt, endAt) {
  const db = getDb();
  return db
    .prepare(`
      SELECT payload_json
      FROM finance_entries
      WHERE posted_at >= ? AND posted_at < ?
      ORDER BY posted_at DESC, entry_id DESC
    `)
    .all(Number(startAt || 0), Number(endAt || 0))
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function replaceSafetyRecords(records = []) {
  const now = Date.now();
  withTransaction((db) => {
    db.prepare("DELETE FROM safety_records").run();
    const insert = db.prepare(`
      INSERT INTO safety_records (
        safety_id, order_id, status, checked_at, has_abnormal, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    records.forEach((record, index) => {
      const safetyId = String(record?.safetyId || record?.orderId || `safety-${index}`).trim();
      if (!safetyId) return;
      insert.run(
        safetyId,
        String(record?.orderId || ""),
        String(record?.status || ""),
        Number(record?.checkedAt || 0),
        record?.hasAbnormal ? 1 : 0,
        now,
        JSON.stringify(record || {})
      );
    });
  });
}

function loadSafetyRecords() {
  const db = getDb();
  return db
    .prepare("SELECT payload_json FROM safety_records ORDER BY updated_at DESC, safety_id ASC")
    .all()
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function listSafetyRecords() {
  return loadSafetyRecords();
}

function findSafetyByOrderId(orderId) {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM safety_records WHERE order_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(String(orderId || ""));
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_err) {
    return null;
  }
}

function findSafetyById(safetyId) {
  const db = getDb();
  const row = db.prepare("SELECT payload_json FROM safety_records WHERE safety_id = ?").get(String(safetyId || ""));
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_err) {
    return null;
  }
}

function replaceOfflineQueue(items = []) {
  const now = Date.now();
  withTransaction((db) => {
    db.prepare("DELETE FROM offline_queue_items").run();
    const insert = db.prepare(`
      INSERT INTO offline_queue_items (
        offline_id, entity_type, action, sync_status, created_at, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    items.forEach((item, index) => {
      const offlineId = String(item?.offlineId || `offline-${index}`).trim();
      if (!offlineId) return;
      insert.run(
        offlineId,
        String(item?.entityType || ""),
        String(item?.action || ""),
        String(item?.syncStatus || ""),
        Number(item?.createdAt || 0),
        now,
        JSON.stringify(item || {})
      );
    });
  });
}

function loadOfflineQueue() {
  const db = getDb();
  return db
    .prepare("SELECT payload_json FROM offline_queue_items ORDER BY created_at DESC, offline_id ASC")
    .all()
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function listOfflineQueueItems() {
  return loadOfflineQueue();
}

function findOfflineQueueItem(offlineId) {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM offline_queue_items WHERE offline_id = ?")
    .get(String(offlineId || ""));
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (_err) {
    return null;
  }
}

module.exports = {
  DB_PATH,
  getDb,
  hasAuthState,
  replaceAuthState,
  loadAuthState,
  hasCustomerLedger,
  replaceCustomerLedger,
  loadCustomerLedger,
  hasRuntimeState,
  saveRuntimeState,
  loadRuntimeState,
  hasRuntimeCollections,
  replaceRuntimeCollections,
  loadRuntimeCollections,
  hasRows,
  replaceOrders,
  loadOrders,
  findOrderById,
  listOrders,
  replaceFinanceEntries,
  loadFinanceEntries,
  listFinanceEntriesInRange,
  replaceSafetyRecords,
  loadSafetyRecords,
  listSafetyRecords,
  findSafetyByOrderId,
  findSafetyById,
  replaceOfflineQueue,
  loadOfflineQueue,
  listOfflineQueueItems,
  findOfflineQueueItem,
};
