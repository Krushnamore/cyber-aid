import { readFileSync } from 'node:fs';
import mysql, { type Pool, type PoolOptions, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

/**
 * MySQL connection (works with MySQL 8 and MariaDB).
 *   DATABASE_URL = mysql://user:pass@host:3306/dbname      (preferred)
 *   or MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 *   MYSQL_SSL=true for managed/cloud databases that require TLS
 */
let pool: Pool | null = null;
let ready: Promise<void> | null = null;

export function dbConfigured(): boolean {
  return !!(process.env['DATABASE_URL'] || process.env['MYSQL_HOST']);
}

function sslOption(): PoolOptions['ssl'] {
  if (!/^(1|true)$/i.test(process.env['MYSQL_SSL'] || '')) return undefined;
  // Aiven & some other hosts use their own CA: pass it as a file path or as PEM text (use \n for line breaks in .env)
  const ca = process.env['MYSQL_SSL_CA'];
  let pem: string | undefined;
  if (ca) pem = ca.includes('BEGIN CERTIFICATE') ? ca.replace(/\\n/g, '\n') : readFileSync(ca, 'utf8');
  return { rejectUnauthorized: process.env['MYSQL_SSL_INSECURE'] !== 'true', ...(pem ? { ca: pem } : {}) };
}

function options(): PoolOptions {
  const common: PoolOptions = { connectionLimit: Number(process.env['MYSQL_POOL'] || 10), waitForConnections: true, timezone: 'Z', charset: 'utf8mb4', ssl: sslOption() };
  const url = process.env['DATABASE_URL'];
  if (url) {
    // parsed by hand so provider query strings such as "?ssl-mode=REQUIRED" are ignored and special characters in the password work
    const u = new URL(url);
    return { ...common, host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'cyberaid' };
  }
  return { ...common, host: process.env['MYSQL_HOST'], port: Number(process.env['MYSQL_PORT'] || 3306), user: process.env['MYSQL_USER'], password: process.env['MYSQL_PASSWORD'], database: process.env['MYSQL_DATABASE'] || 'cyberaid' };
}

export function getPool(): Pool {
  if (!dbConfigured()) throw new Error('MySQL is not configured. Set DATABASE_URL (mysql://user:pass@host:3306/db) or MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.');
  return (pool ??= mysql.createPool(options()));
}

export async function q<T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, params as never[]);
  return rows;
}
export async function exec(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await getPool().query<ResultSetHeader>(sql, params as never[]);
  return res;
}

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    password_hash VARCHAR(255) NULL,
    email_verified TINYINT(1) NOT NULL DEFAULT 0,
    provider ENUM('password','google','demo') NOT NULL DEFAULT 'password',
    avatar VARCHAR(500) NOT NULL,
    headline VARCHAR(160) NOT NULL DEFAULT 'CyberAid community member',
    token_version INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    last_login_at DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    purpose ENUM('verify_email','reset_password') NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    attempts TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_otp_email (email, purpose, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(40) PRIMARY KEY,
    author_id CHAR(36) NULL,
    author_name VARCHAR(80) NOT NULL,
    author_headline VARCHAR(160) NOT NULL,
    author_avatar VARCHAR(500) NOT NULL,
    verified TINYINT(1) NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    media_type ENUM('image','video') NULL,
    media_url VARCHAR(1000) NULL,
    video_title VARCHAR(120) NULL,
    tags TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_posts_created (created_at),
    INDEX idx_posts_author (author_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS post_likes (
    post_id VARCHAR(40) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (post_id, user_id),
    CONSTRAINT fk_like_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(40) PRIMARY KEY,
    post_id VARCHAR(40) NOT NULL,
    author_id CHAR(36) NULL,
    author_name VARCHAR(80) NOT NULL,
    avatar VARCHAR(500) NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_comments_post (post_id, created_at),
    CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS entity_reports (
    id CHAR(36) PRIMARY KEY,
    entity_key VARCHAR(255) NOT NULL,
    kind VARCHAR(10) NOT NULL,
    value VARCHAR(500) NOT NULL,
    note VARCHAR(500) NULL,
    reporter_id CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    UNIQUE KEY uq_report (entity_key, reporter_id),
    INDEX idx_report_key (entity_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS blocklist (
    user_id CHAR(36) NOT NULL,
    entity_key VARCHAR(255) NOT NULL,
    kind VARCHAR(10) NOT NULL,
    value VARCHAR(500) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (user_id, entity_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(40) PRIMARY KEY,
    ts DATETIME(3) NOT NULL,
    kind VARCHAR(10) NOT NULL,
    verdict VARCHAR(12) NOT NULL,
    score SMALLINT NOT NULL,
    user_id CHAR(36) NULL,
    INDEX idx_scans_ts (ts)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS quiz_scores (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(80) NOT NULL,
    score TINYINT NOT NULL,
    total TINYINT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_quiz_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS kv (
    k VARCHAR(100) PRIMARY KEY,
    v MEDIUMTEXT NOT NULL,
    updated_at DATETIME(3) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

/** Creates tables (idempotent). Call once; concurrent callers share the same promise. */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of SCHEMA) await exec(sql);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function closeDb() { await pool?.end(); pool = null; ready = null; }
