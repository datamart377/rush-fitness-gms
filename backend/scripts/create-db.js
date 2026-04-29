// Creates the database if it doesn't already exist.
// Connects to the default `postgres` database to issue CREATE DATABASE.
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const dbName = process.env.DB_NAME || 'rush_fitness_gms';
  const adminCfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  };

  const client = new Client(adminCfg);
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount > 0) {
      console.log(`✓ Database "${dbName}" already exists.`);
    } else {
      // Identifiers can't be parameterised, so we validate strictly.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
        throw new Error(`Invalid DB_NAME: ${dbName}`);
      }
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✓ Created database "${dbName}".`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('✗ create-db failed.');
  console.error('  message:', err.message || '(no message)');
  if (err.code)    console.error('  code:   ', err.code);
  if (err.address) console.error('  address:', err.address);
  if (err.port)    console.error('  port:   ', err.port);
  if (err.detail)  console.error('  detail: ', err.detail);
  console.error('  stack:  ', err.stack);
  console.error('');
  console.error('Common causes:');
  console.error('  • Postgres is not running   →  brew services start postgresql@16');
  console.error('  • DB_USER in .env is wrong  →  on Homebrew Macs the superuser is your macOS user (try DB_USER=' + (process.env.USER || 'your-mac-username') + ')');
  console.error('  • Bad host/port              →  check DB_HOST and DB_PORT in .env');
  process.exit(1);
});
