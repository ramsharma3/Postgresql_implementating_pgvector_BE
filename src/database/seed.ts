import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const host = process.env.PG_HOST || 'localhost';
  const port = parseInt(process.env.PG_PORT || '5432', 10);
  const user = process.env.PG_USER || 'postgres';
  const password = process.env.PG_PASSWORD || 'postgres123';
  const database = process.env.PG_DATABASE || 'kg_explorer';

  console.log(`Connecting to PostgreSQL database "${database}" on ${host}:${port} as ${user}...`);

  const pool = new Pool({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 5000,
  });

  try {
    const seedSqlPath = path.join(__dirname, '../../../database/seed.sql');
    console.log(`Reading SQL seed file from: ${seedSqlPath}`);
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

    console.log('Executing database schema creation and seeder scripts...');
    
    // Execute the complete script in a single client transaction/session block
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(seedSql);
      await client.query('COMMIT');
      console.log('PostgreSQL database successfully initialized and seeded with 92 nodes and 407 relationships!');
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('Failed to execute seed SQL statements. Transaction rolled back.');
      throw err;
    } finally {
      client.release();
    }

  } catch (err: any) {
    console.error('Migration Seeding Task failed:', err.message, err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
