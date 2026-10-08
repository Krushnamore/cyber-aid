// Test helper: point at a throw-away MySQL/MariaDB database and reset it.
export const TEST_DB_URL = process.env['TEST_DATABASE_URL'] || process.env['DATABASE_URL'] || 'mysql://cyber:cyberpass@127.0.0.1:3306/cyberaid';
process.env['DATABASE_URL'] = TEST_DB_URL;
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-123456';
process.env['ALLOW_DEMO_AUTH'] = 'true';
process.env['DEMO_RATE_LIMIT'] = '200';
delete process.env['NODE_ENV'];

export async function freshDb() {
  const { exec, initDb } = await import('../src/server/db');
  await exec('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['post_likes', 'comments', 'posts', 'entity_reports', 'blocklist', 'scans', 'quiz_scores', 'otp_codes', 'users', 'kv']) await exec(`DROP TABLE IF EXISTS ${t}`);
  await exec('SET FOREIGN_KEY_CHECKS=1');
  await initDb();
}
