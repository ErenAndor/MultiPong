const path = require('path');
const bcrypt = require('bcrypt');

/**
 * Hybrid Database Adapter
 * Uses PostgreSQL if DATABASE_URL is present (Production)
 * Uses SQLite if not (Local Development)
 */
class Database {
    constructor() {
        this.type = process.env.DATABASE_URL ? 'postgres' : 'sqlite';
        this.client = null;

        this.initConnection();
    }

    initConnection() {
        if (this.type === 'postgres') {
            console.log('Initializing PostgreSQL connection...');
            const { Pool } = require('pg');
            this.client = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false } // Required for Render
            });
            this.client.connect().then(() => {
                console.log('Connected to PostgreSQL');
                this.initSchema();
            }).catch(err => {
                console.error('PostgreSQL Connection Error:', err);
            });
        } else {
            console.log('Initializing SQLite connection...');
            const sqlite3 = require('sqlite3').verbose();
            // Use env path or default local path
            const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'pong.db');
            this.client = new sqlite3.Database(dbPath, (err) => {
                if (err) console.error('SQLite Error:', err);
                else {
                    console.log(`Connected to SQLite at ${dbPath}`);
                    this.initSchema();
                }
            });
        }
    }

    initSchema() {
        if (this.type === 'postgres') {
            const query = `
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    high_score INTEGER DEFAULT 0,
                    total_goals INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            this.client.query(query).catch(e => console.error('Schema Error:', e));
        } else {
            const query = `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE,
                    password_hash TEXT,
                    high_score INTEGER DEFAULT 0,
                    total_goals INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;
            this.client.run(query, (e) => {
                if (e) console.error('Schema Error:', e);
            });
        }
    }

    async register(username, password) {
        const hash = await bcrypt.hash(password, 10);

        if (this.type === 'postgres') {
            const query = 'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id';
            try {
                const res = await this.client.query(query, [username, hash]);
                return { id: res.rows[0].id, username };
            } catch (err) {
                if (err.code === '23505') throw new Error('Username already exists'); // Unique violation
                throw err;
            }
        } else {
            return new Promise((resolve, reject) => {
                this.client.run(
                    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                    [username, hash],
                    function (err) {
                        if (err) {
                            if (err.message.includes('UNIQUE')) reject(new Error('Username already exists'));
                            else reject(err);
                        } else {
                            resolve({ id: this.lastID, username });
                        }
                    }
                );
            });
        }
    }

    async login(username, password) {
        let user;

        if (this.type === 'postgres') {
            const res = await this.client.query('SELECT * FROM users WHERE username = $1', [username]);
            user = res.rows[0];
        } else {
            user = await new Promise((resolve, reject) => {
                this.client.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }

        if (!user) throw new Error('User not found');

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) throw new Error('Invalid password');

        return user;
    }

    updateStats(username, scoreChange, goalsChange) {
        if (this.type === 'postgres') {
            const query = `
                UPDATE users SET 
                    high_score = GREATEST(high_score, $1),
                    total_goals = total_goals + $2
                WHERE username = $3
            `;
            this.client.query(query, [scoreChange, goalsChange, username])
                .catch(e => console.error('Update Stats Error:', e));
        } else {
            const query = `
                UPDATE users SET 
                    high_score = MAX(high_score, ?),
                    total_goals = total_goals + ?
                WHERE username = ?
            `;
            this.client.run(query, [scoreChange, goalsChange, username], (e) => {
                if (e) console.error('Update Stats Error:', e);
            });
        }
    }

    getTopScores(limit = 10) {
        if (this.type === 'postgres') {
            return this.client.query(
                'SELECT username, high_score FROM users ORDER BY high_score DESC LIMIT $1',
                [limit]
            ).then(res => res.rows);
        } else {
            return new Promise((resolve, reject) => {
                this.client.all(
                    'SELECT username, high_score FROM users ORDER BY high_score DESC LIMIT ?',
                    [limit],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
        }
    }
}

module.exports = new Database();
