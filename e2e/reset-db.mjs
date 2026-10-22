// Recria o schema do banco de E2E (executado antes de a API subir e aplicar as migrações).
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
await client.end();
