import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/birthday-bot.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dir = path.dirname(DB_PATH);
    import('fs').then(fs => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
    logger.info('Database initialized', { path: DB_PATH });
  }
  return db;
}

function initializeSchema(database: Database.Database) {
  database.exec(`
    -- Track birthday wishes we've responded to (avoid duplicates)
    CREATE TABLE IF NOT EXISTS birthday_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      birthday_person_name TEXT NOT NULL,
      response_date TEXT NOT NULL,  -- YYYY-MM-DD format
      group_id TEXT NOT NULL,
      original_message_id TEXT,
      our_response TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(birthday_person_name, response_date, group_id)
    );

    -- Track all processed messages (for debugging)
    CREATE TABLE IF NOT EXISTS processed_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      message_body TEXT NOT NULL,
      is_birthday BOOLEAN NOT NULL,
      is_initial_wish BOOLEAN NOT NULL,
      birthday_person_name TEXT,
      confidence REAL,
      action_taken TEXT,  -- 'responded', 'skipped_duplicate', 'skipped_followup', 'skipped_low_confidence'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for faster lookups
    CREATE INDEX IF NOT EXISTS idx_birthday_responses_lookup 
      ON birthday_responses(birthday_person_name, response_date, group_id);
    
    CREATE INDEX IF NOT EXISTS idx_processed_messages_date 
      ON processed_messages(created_at);
  `);
}

/**
 * Check if we've already responded to this person's birthday today
 */
export function hasRespondedToday(
  birthdayPersonName: string,
  groupId: string
): boolean {
  const database = getDatabase();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  const stmt = database.prepare(`
    SELECT COUNT(*) as count 
    FROM birthday_responses 
    WHERE birthday_person_name = ? 
      AND response_date = ? 
      AND group_id = ?
  `);
  
  const result = stmt.get(birthdayPersonName.toLowerCase(), today, groupId) as { count: number };
  return result.count > 0;
}

/**
 * Record that we responded to a birthday
 */
export function recordBirthdayResponse(
  birthdayPersonName: string,
  groupId: string,
  originalMessageId: string,
  ourResponse: string
): void {
  const database = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO birthday_responses 
    (birthday_person_name, response_date, group_id, original_message_id, our_response)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(birthdayPersonName.toLowerCase(), today, groupId, originalMessageId, ourResponse);
  logger.info('Recorded birthday response', { birthdayPersonName, groupId });
}

/**
 * Log a processed message for debugging
 */
export function logProcessedMessage(
  messageId: string,
  groupId: string,
  senderId: string,
  messageBody: string,
  isBirthday: boolean,
  isInitialWish: boolean,
  birthdayPersonName: string | null,
  confidence: number,
  actionTaken: string
): void {
  const database = getDatabase();
  
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO processed_messages 
    (message_id, group_id, sender_id, message_body, is_birthday, is_initial_wish, 
     birthday_person_name, confidence, action_taken)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    messageId,
    groupId,
    senderId,
    messageBody,
    isBirthday ? 1 : 0,
    isInitialWish ? 1 : 0,
    birthdayPersonName,
    confidence,
    actionTaken
  );
}

/**
 * Get recent responses for debugging
 */
export function getRecentResponses(limit: number = 10): unknown[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM birthday_responses 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

