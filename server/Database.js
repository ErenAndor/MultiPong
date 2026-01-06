const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'pong.db'), (err) => {
            if (err) console.error('DB Error:', err);
            else {
                console.log('Connected to SQLite');
                this.init();
            }
        });
    }

    init() {
        this.db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            high_score INTEGER DEFAULT 0,
            total_goals INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }

    async register(username, password) {
        const hash = await bcrypt.hash(password, 10);
        return new Promise((resolve, reject) => {
            this.db.run(
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

    async login(username, password) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
                if (err) return reject(err);
                if (!user) return reject(new Error('User not found'));

                const match = await bcrypt.compare(password, user.password_hash);
                if (!match) return reject(new Error('Invalid password'));

                resolve(user);
            });
        });
    }

    updateStats(username, scoreChange, goalsChange) {
        this.db.run(
            `UPDATE users SET 
                high_score = MAX(high_score, ?),
                total_goals = total_goals + ?
             WHERE username = ?`,
            [scoreChange, goalsChange, username]
        );
    }

    getTopScores(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
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

module.exports = new Database();
