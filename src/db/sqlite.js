import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveFromRoot } from '../config.js';

function now() {
  return new Date().toISOString();
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export class SqliteStore {
  constructor(dbPath, logger) {
    this.dbPath = resolveFromRoot(dbPath);
    this.logger = logger;
    mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        name TEXT,
        company TEXT,
        phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        email TEXT,
        conversation_id TEXT,
        visitor_name TEXT,
        company TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id INTEGER,
        summary TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id),
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        email TEXT UNIQUE,
        name TEXT,
        company TEXT,
        phone TEXT,
        intent TEXT,
        industry TEXT,
        urgency TEXT,
        budget_signals TEXT,
        score INTEGER DEFAULT 0,
        summary TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS lead_interests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        interest TEXT NOT NULL,
        source_session_id TEXT,
        confidence REAL DEFAULT 0.5,
        urgency TEXT,
        last_mentioned_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(lead_id, interest),
        FOREIGN KEY(lead_id) REFERENCES leads(id)
      );

      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        conversation_id TEXT,
        email TEXT,
        event_type TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
        ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
      CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics(session_id);
    `);
  }

  close() {
    this.db.close();
  }

  upsertUser(visitor = {}) {
    const email = normalizeEmail(visitor.email);
    if (!email) return null;

    const timestamp = now();
    this.db.prepare(`
      INSERT INTO users (email, name, company, phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = COALESCE(NULLIF(excluded.name, ''), users.name),
        company = COALESCE(NULLIF(excluded.company, ''), users.company),
        phone = COALESCE(NULLIF(excluded.phone, ''), users.phone),
        updated_at = excluded.updated_at
    `).run(
      email,
      visitor.name || '',
      visitor.company || '',
      visitor.phone || '',
      timestamp,
      timestamp
    );

    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  ensureSession({ sessionId, conversationId, visitor = {} }) {
    const timestamp = now();
    const email = normalizeEmail(visitor.email);
    const user = this.upsertUser(visitor);

    this.db.prepare(`
      INSERT INTO sessions (id, user_id, email, conversation_id, visitor_name, company, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, sessions.user_id),
        email = COALESCE(NULLIF(excluded.email, ''), sessions.email),
        conversation_id = COALESCE(NULLIF(excluded.conversation_id, ''), sessions.conversation_id),
        visitor_name = COALESCE(NULLIF(excluded.visitor_name, ''), sessions.visitor_name),
        company = COALESCE(NULLIF(excluded.company, ''), sessions.company),
        updated_at = excluded.updated_at
    `).run(
      sessionId,
      user?.id || null,
      email,
      conversationId,
      visitor.name || '',
      visitor.company || '',
      timestamp,
      timestamp
    );

    this.db.prepare(`
      INSERT INTO conversations (id, session_id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        user_id = COALESCE(excluded.user_id, conversations.user_id),
        updated_at = excluded.updated_at
    `).run(conversationId, sessionId, user?.id || null, timestamp, timestamp);

    return {
      user,
      session: this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId),
      conversation: this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId),
    };
  }

  addMessage({ conversationId, sessionId, role, content, metadata = {} }) {
    const result = this.db.prepare(`
      INSERT INTO messages (conversation_id, session_id, role, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(conversationId, sessionId, role, content, json(metadata), now());

    return result.lastInsertRowid;
  }

  recentMessages(conversationId, limit = 8) {
    const rows = this.db.prepare(`
      SELECT role, content, metadata, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(conversationId, limit);

    return rows.reverse().map((row) => ({
      ...row,
      metadata: parseJson(row.metadata, {}),
    }));
  }

  history(conversationId) {
    const conversation = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    const messages = this.db.prepare(`
      SELECT id, role, content, metadata, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id ASC
    `).all(conversationId).map((row) => ({
      ...row,
      metadata: parseJson(row.metadata, {}),
    }));

    return { conversation, messages };
  }

  updateConversationSummary(conversationId, summary) {
    this.db.prepare(`
      UPDATE conversations
      SET summary = ?, updated_at = ?
      WHERE id = ?
    `).run(summary || '', now(), conversationId);
  }

  summarizeConversation(conversationId) {
    const messages = this.recentMessages(conversationId, 10);
    const useful = messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-6)
      .map((message) => `${message.role}: ${message.content.slice(0, 180)}`)
      .join(' | ');

    return useful.slice(0, 900);
  }

  upsertLead({ visitor = {}, lead, sessionId, conversationId, summary }) {
    const email = normalizeEmail(lead.email || visitor.email);
    if (!email) {
      return {
        ...lead,
        accumulatedInterests: lead.sessionInterests || [],
      };
    }

    const user = this.upsertUser({ ...visitor, email });
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO leads (
        user_id, email, name, company, phone, intent, industry, urgency,
        budget_signals, score, summary, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, leads.user_id),
        name = COALESCE(NULLIF(excluded.name, ''), leads.name),
        company = COALESCE(NULLIF(excluded.company, ''), leads.company),
        phone = COALESCE(NULLIF(excluded.phone, ''), leads.phone),
        intent = COALESCE(NULLIF(excluded.intent, ''), leads.intent),
        industry = COALESCE(NULLIF(excluded.industry, ''), leads.industry),
        urgency = CASE
          WHEN excluded.urgency = 'high' THEN 'high'
          WHEN leads.urgency = 'high' THEN leads.urgency
          WHEN excluded.urgency = 'medium' THEN 'medium'
          ELSE COALESCE(NULLIF(leads.urgency, ''), excluded.urgency)
        END,
        budget_signals = COALESCE(NULLIF(excluded.budget_signals, ''), leads.budget_signals),
        score = MAX(leads.score, excluded.score),
        summary = COALESCE(NULLIF(excluded.summary, ''), leads.summary),
        updated_at = excluded.updated_at
    `).run(
      user?.id || null,
      email,
      visitor.name || '',
      visitor.company || '',
      visitor.phone || '',
      lead.intent || '',
      lead.industry || '',
      lead.urgency || '',
      lead.budgetSignals || '',
      lead.score || 0,
      summary || '',
      timestamp,
      timestamp
    );

    const storedLead = this.db.prepare('SELECT * FROM leads WHERE email = ?').get(email);
    for (const interest of lead.sessionInterests || []) {
      this.db.prepare(`
        INSERT INTO lead_interests (
          lead_id, interest, source_session_id, confidence, urgency,
          last_mentioned_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lead_id, interest) DO UPDATE SET
          confidence = MAX(lead_interests.confidence, excluded.confidence),
          urgency = CASE
            WHEN excluded.urgency = 'high' THEN 'high'
            WHEN lead_interests.urgency = 'high' THEN lead_interests.urgency
            ELSE COALESCE(excluded.urgency, lead_interests.urgency)
          END,
          last_mentioned_at = excluded.last_mentioned_at,
          updated_at = excluded.updated_at
      `).run(
        storedLead.id,
        interest,
        sessionId,
        0.75,
        lead.urgency || 'unknown',
        timestamp,
        timestamp,
        timestamp
      );
    }

    const accumulatedInterests = this.db.prepare(`
      SELECT interest FROM lead_interests WHERE lead_id = ? ORDER BY updated_at DESC
    `).all(storedLead.id).map((row) => row.interest);

    this.logEvent({
      sessionId,
      conversationId,
      email,
      eventType: 'lead_updated',
      payload: {
        intent: lead.intent,
        score: lead.score,
        sessionInterests: lead.sessionInterests,
        accumulatedInterests,
      },
    });

    return {
      ...lead,
      email,
      accumulatedInterests: unique(accumulatedInterests),
      score: Math.max(storedLead.score || 0, lead.score || 0),
    };
  }

  explicitLeadCapture({ sessionId, conversationId, visitor = {}, interests = [], score = 0 }) {
    const lead = {
      email: visitor.email,
      intent: 'explicit lead capture',
      industry: '',
      sessionInterests: interests,
      accumulatedInterests: interests,
      urgency: 'unknown',
      budgetSignals: '',
      score: Math.max(score, 75),
    };

    return this.upsertLead({
      visitor,
      lead,
      sessionId,
      conversationId,
      summary: 'Visitor explicitly shared contact details.',
    });
  }

  logEvent({ sessionId, conversationId, email, eventType, payload = {} }) {
    this.db.prepare(`
      INSERT INTO analytics (session_id, conversation_id, email, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId || '', conversationId || '', normalizeEmail(email), eventType, json(payload), now());
  }
}
