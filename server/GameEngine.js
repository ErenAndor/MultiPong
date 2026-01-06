const Database = require('./Database');

const TICK_RATE = 60;
const TICK_DT = 1 / TICK_RATE;
const ARENA_SIZE = 800;
const PADDLE_LENGTH = 100;
const PADDLE_WIDTH = 10;
const BALL_SIZE = 10;
const BALL_SPEED = 600;
const POWERUP_SIZE = 50;
const POWERUP_DURATION = 8000;
const GAME_DURATION = 180; // 3 minutes

class GameEngine {
    constructor(roomId, io, onGameOver, activeUsers, durationInMinutes = 3, bots = new Map()) {
        this.roomId = roomId;
        this.io = io;
        this.onGameOver = onGameOver;
        this.activeUsers = activeUsers;
        this.bots = bots; // Bot instances for AI movement

        this.running = false;
        this.interval = null;
        this.lastTimeTick = Date.now();
        this.gameTime = durationInMinutes * 60;
        this.initialGameTime = durationInMinutes * 60; // Store initial time for speed calculations

        // Progressive speed increase
        this.speedMultiplier = 1.0;
        this.lastSpeedIncrease = Date.now();
        this.speedIncreaseInterval = 15000; // Increase speed every 15 seconds

        // Game State
        this.balls = [{ x: ARENA_SIZE / 2, y: ARENA_SIZE / 2, vx: 0, vy: 0, color: '#fff', isDecoy: false, lastHitter: null }];
        // Initialize paddles with isBot and protected flags
        this.paddles = {
            bottom: { pos: ARENA_SIZE / 2, len: PADDLE_LENGTH, score: 0, active: false, socketId: null, name: 'P1', wall: 'bottom', effects: {}, isBot: false, protected: false },
            top: { pos: ARENA_SIZE / 2, len: PADDLE_LENGTH, score: 0, active: false, socketId: null, name: 'P2', wall: 'top', effects: {}, isBot: false, protected: false },
            left: { pos: ARENA_SIZE / 2, len: PADDLE_LENGTH, score: 0, active: false, socketId: null, name: 'P3', wall: 'left', effects: {}, isBot: false, protected: false },
            right: { pos: ARENA_SIZE / 2, len: PADDLE_LENGTH, score: 0, active: false, socketId: null, name: 'P4', wall: 'right', effects: {}, isBot: false, protected: false }
        };

        this.powerups = [];
        this.lastPowerupSpawn = Date.now();
        this.lastTimeTick = Date.now();
    }

    init(players) {
        players.forEach(p => {
            if (this.paddles[p.wall]) {
                this.paddles[p.wall].active = true;
                this.paddles[p.wall].socketId = p.id;
                this.paddles[p.wall].name = p.username;
                this.paddles[p.wall].isBot = !!p.isBot;
            }
        });

        this.resetBall(this.balls[0]);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.interval = setInterval(() => this.tick(), 1000 / TICK_RATE);
    }

    stop() {
        this.running = false;
        clearInterval(this.interval);
    }

    updatePaddle(socketId, position) {
        for (const [wall, paddle] of Object.entries(this.paddles)) {
            if (paddle.socketId === socketId) {
                const halfP = paddle.len / 2;
                paddle.pos = Math.max(halfP, Math.min(ARENA_SIZE - halfP, position));
                break;
            }
        }
    }

    tick() {
        if (!this.running) return;

        // 1. Time Management
        if (Date.now() - this.lastTimeTick >= 1000) {
            this.gameTime--;
            this.lastTimeTick = Date.now();
            if (this.gameTime <= 0) {
                this.stop();
                const finalScores = this.getFinalScores();
                this.saveFinalScoresToDB();
                this.io.to(this.roomId).emit('gameOver', { scores: finalScores });
                this.onGameOver();
                return;
            }
        }

        // 2. Update Bot Paddles (AI Movement)
        this.updateBotPaddles();

        // 3. Spawn Power-ups
        if (Date.now() - this.lastPowerupSpawn > 8000) {
            this.spawnPowerup();
            this.lastPowerupSpawn = Date.now();
        }

        // 4. Clear Expired Power-ups
        const now = Date.now();
        this.powerups = this.powerups.filter(pu => now < pu.expiresAt);

        // 5. Progressive Speed Increase (every 15 seconds, increase ball speed by 8%)
        if (now - this.lastSpeedIncrease > this.speedIncreaseInterval) {
            this.speedMultiplier = Math.min(2.0, this.speedMultiplier * 1.08); // Cap at 2x speed
            this.lastSpeedIncrease = now;

            // Apply speed increase to all balls
            this.balls.forEach(ball => {
                if (!ball.isDecoy) {
                    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
                    if (currentSpeed > 0) {
                        const newSpeed = currentSpeed * 1.08;
                        const angle = Math.atan2(ball.vy, ball.vx);
                        ball.vx = Math.cos(angle) * newSpeed;
                        ball.vy = Math.sin(angle) * newSpeed;
                    }
                }
            });
            console.log(`Ball speed increased! Multiplier: ${this.speedMultiplier.toFixed(2)}x`);
        }

        // 5. Move Balls
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            ball.x += ball.vx * TICK_DT;
            ball.y += ball.vy * TICK_DT;

            // Collision Detection (Walls/Paddles)
            if (ball.x - BALL_SIZE <= 0) this.handleWallHit(ball, 'left', i);
            else if (ball.x + BALL_SIZE >= ARENA_SIZE) this.handleWallHit(ball, 'right', i);

            if (ball.y - BALL_SIZE <= 0) this.handleWallHit(ball, 'top', i);
            else if (ball.y + BALL_SIZE >= ARENA_SIZE) this.handleWallHit(ball, 'bottom', i);

            // Collision Detection (Power-ups)
            for (let j = this.powerups.length - 1; j >= 0; j--) {
                const pu = this.powerups[j];
                const dx = ball.x - pu.x;
                const dy = ball.y - pu.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < BALL_SIZE + POWERUP_SIZE / 2) {
                    this.applyPowerup(pu, ball);
                    this.powerups.splice(j, 1);
                }
            }
        }

        // 6. Broadcast State
        this.io.to(this.roomId).emit('gameState', {
            balls: this.balls.map(b => ({ x: b.x, y: b.y, color: b.color })),
            paddles: {
                top: { pos: this.paddles.top.pos, len: this.paddles.top.len, name: this.paddles.top.name, score: this.paddles.top.score, active: this.paddles.top.active, effects: this.paddles.top.effects, isBot: this.paddles.top.isBot, protected: this.paddles.top.protected },
                bottom: { pos: this.paddles.bottom.pos, len: this.paddles.bottom.len, name: this.paddles.bottom.name, score: this.paddles.bottom.score, active: this.paddles.bottom.active, effects: this.paddles.bottom.effects, isBot: this.paddles.bottom.isBot, protected: this.paddles.bottom.protected },
                left: { pos: this.paddles.left.pos, len: this.paddles.left.len, name: this.paddles.left.name, score: this.paddles.left.score, active: this.paddles.left.active, effects: this.paddles.left.effects, isBot: this.paddles.left.isBot, protected: this.paddles.left.protected },
                right: { pos: this.paddles.right.pos, len: this.paddles.right.len, name: this.paddles.right.name, score: this.paddles.right.score, active: this.paddles.right.active, effects: this.paddles.right.effects, isBot: this.paddles.right.isBot, protected: this.paddles.right.protected }
            },
            powerups: this.powerups.map(pu => ({ x: pu.x, y: pu.y, type: pu.type, timeLeft: pu.expiresAt - Date.now() })),
            timeLeft: this.gameTime
        });
    }

    /**
     * Update all bot paddle positions using AI
     */
    updateBotPaddles() {
        for (const [wall, paddle] of Object.entries(this.paddles)) {
            if (paddle.isBot && paddle.active) {
                // Find the bot instance
                const bot = Array.from(this.bots.values()).find(b => b.wall === wall);
                if (bot) {
                    const newPos = bot.calculateMove(this.balls, ARENA_SIZE);
                    const halfP = paddle.len / 2;
                    paddle.pos = Math.max(halfP, Math.min(ARENA_SIZE - halfP, newPos));
                }
            }
        }
    }

    spawnPowerup() {
        const types = ['speed', 'size', 'fake', 'blind', 'reverse', 'shield'];
        const type = types[Math.floor(Math.random() * types.length)];
        this.powerups.push({
            x: Math.random() * (ARENA_SIZE - 200) + 100,
            y: Math.random() * (ARENA_SIZE - 200) + 100,
            type: type,
            expiresAt: Date.now() + POWERUP_DURATION
        });
    }

    applyPowerup(pu, ball) {
        const lastHitterWall = ball.lastHitter;
        const isPositive = (pu.type === 'speed' || pu.type === 'size');

        if (isPositive || pu.type === 'shield') {
            // Apply to last hitter only
            if (lastHitterWall && this.paddles[lastHitterWall].active) {
                this.activateEffect(pu.type, lastHitterWall, ball);
            }
        } else {
            // Apply to ALL EXCEPT last hitter
            Object.keys(this.paddles).forEach(wall => {
                if (wall !== lastHitterWall && this.paddles[wall].active) {
                    this.activateEffect(pu.type, wall, ball);
                }
            });
        }
    }

    activateEffect(type, wall, ball) {
        const paddle = this.paddles[wall];
        if (type === 'speed' && ball) {
            ball.vx *= 1.8;
            ball.vy *= 1.8;
            setTimeout(() => { if (ball) { ball.vx /= 1.8; ball.vy /= 1.8; } }, 5000);
        } else if (type === 'size') {
            paddle.len = PADDLE_LENGTH * 1.8;
            setTimeout(() => paddle.len = PADDLE_LENGTH, 6000);
        } else if (type === 'fake') {
            // Fake ball goes towards OTHER players (the wall parameter is one of the opponents)
            // Get wall center coordinates for target
            const targetPositions = {
                top: { x: ARENA_SIZE / 2, y: 0 },
                bottom: { x: ARENA_SIZE / 2, y: ARENA_SIZE },
                left: { x: 0, y: ARENA_SIZE / 2 },
                right: { x: ARENA_SIZE, y: ARENA_SIZE / 2 }
            };

            // Find active opponents (not the last hitter)
            const lastHitter = ball ? ball.lastHitter : null;
            const opponents = Object.keys(this.paddles).filter(w =>
                w !== lastHitter && this.paddles[w].active
            );

            if (opponents.length > 0) {
                // Pick a random opponent
                const targetWall = opponents[Math.floor(Math.random() * opponents.length)];
                const target = targetPositions[targetWall];

                // Calculate angle towards target with some randomness
                const angleToTarget = Math.atan2(target.y - ARENA_SIZE / 2, target.x - ARENA_SIZE / 2);
                const randomOffset = (Math.random() - 0.5) * 0.5; // +/- ~15 degrees
                const finalAngle = angleToTarget + randomOffset;

                const decoy = {
                    x: ARENA_SIZE / 2,
                    y: ARENA_SIZE / 2,
                    vx: Math.cos(finalAngle) * BALL_SPEED * 1.3,
                    vy: Math.sin(finalAngle) * BALL_SPEED * 1.3,
                    color: '#ff4444',
                    isDecoy: true,
                    lastHitter: null
                };
                this.balls.push(decoy);
                setTimeout(() => {
                    const idx = this.balls.indexOf(decoy);
                    if (idx > -1) this.balls.splice(idx, 1);
                }, 6000);
            }
        } else if (type === 'blind') {
            paddle.effects.blind = true;
            setTimeout(() => delete paddle.effects.blind, 4000);
        } else if (type === 'reverse') {
            paddle.effects.reverse = true;
            setTimeout(() => delete paddle.effects.reverse, 5000);
        } else if (type === 'shield') {
            paddle.effects.shield = true;
        }
    }

    saveFinalScoresToDB() {
        Object.values(this.paddles).forEach(p => {
            if (p.active && p.socketId) {
                const session = this.activeUsers.get(p.socketId);
                if (session && !session.isGuest) {
                    // Update High Score in DB
                    Database.updateStats(session.username, p.score, 0);
                }
            }
        });
    }

    handleWallHit(ball, wall, ballIndex) {
        const paddle = this.paddles[wall];

        // Protected walls (countdown) act as solid walls
        if (!paddle.active || paddle.protected) {
            this.bounce(ball, wall);
            return;
        }

        let hit = false;
        const pPos = paddle.pos;
        const bPos = (wall === 'top' || wall === 'bottom') ? ball.x : ball.y;

        if (Math.abs(bPos - pPos) <= paddle.len / 2 + BALL_SIZE) {
            hit = true;
        }

        if (hit) {
            this.bounce(ball, wall);
            ball.lastHitter = wall; // Mark hitter

            // Increment total goals/hits for registered users
            if (paddle.socketId) {
                const session = this.activeUsers.get(paddle.socketId);
                if (session && !session.isGuest) {
                    Database.updateStats(session.username, 0, 1);
                }
            }

            if (!ball.isDecoy) {
                ball.vx *= 1.05;
                ball.vy *= 1.05;
            }
        } else {
            if (ball.isDecoy) {
                this.balls.splice(ballIndex, 1);
            } else {
                if (paddle.effects.shield) {
                    delete paddle.effects.shield;
                    this.bounce(ball, wall);
                    this.io.to(this.roomId).emit('gameEvent', { type: 'shield_save', wall });
                } else {
                    // Goal!
                    if (ball.lastHitter && this.paddles[ball.lastHitter]) {
                        this.paddles[ball.lastHitter].score += 1;
                    }
                    paddle.score -= 1; // Penalty for missing

                    // Clear blind effect on goal conceded
                    if (paddle.effects.blind) {
                        delete paddle.effects.blind;
                    }

                    this.resetBall(ball);
                    this.io.to(this.roomId).emit('gameEvent', {
                        type: 'score',
                        wall,
                        score: paddle.score,
                        hitter: ball.lastHitter,
                        hitterScore: ball.lastHitter ? this.paddles[ball.lastHitter].score : null
                    });
                }
            }
        }
    }

    bounce(ball, wall) {
        if (wall === 'left' || wall === 'right') {
            ball.vx *= -1;
            ball.x = (wall === 'left') ? BALL_SIZE + 1 : ARENA_SIZE - BALL_SIZE - 1;
        } else {
            ball.vy *= -1;
            ball.y = (wall === 'top') ? BALL_SIZE + 1 : ARENA_SIZE - BALL_SIZE - 1;
        }
    }

    resetBall(ball) {
        ball.x = ARENA_SIZE / 2;
        ball.y = ARENA_SIZE / 2;
        ball.lastHitter = null;

        // Pause ball for 500ms before launching
        ball.vx = 0;
        ball.vy = 0;

        setTimeout(() => {
            const speed = BALL_SPEED * this.speedMultiplier;

            // Ensure the ball doesn't move too horizontally (min 30 degrees from horizontal)
            let angle;
            const sector = Math.floor(Math.random() * 4); // 4 diagonal sectors
            switch (sector) {
                case 0: angle = (Math.random() * (Math.PI / 3)) + (Math.PI / 12); break;
                case 1: angle = (Math.random() * (Math.PI / 3)) + (Math.PI / 12) + Math.PI / 2; break;
                case 2: angle = (Math.random() * (Math.PI / 3)) + (Math.PI / 12) + Math.PI; break;
                case 3: angle = (Math.random() * (Math.PI / 3)) + (Math.PI / 12) + 3 * Math.PI / 2; break;
            }

            ball.vx = Math.cos(angle) * speed;
            ball.vy = Math.sin(angle) * speed;
        }, 500);
    }

    /**
     * Add a player who is joining mid-game (with protection)
     */
    addJoiningPlayer(player) {
        if (this.paddles[player.wall]) {
            this.paddles[player.wall].active = true;
            this.paddles[player.wall].socketId = player.id;
            this.paddles[player.wall].name = player.username;
            this.paddles[player.wall].isBot = false;
            this.paddles[player.wall].protected = true; // Protected during countdown
            this.paddles[player.wall].score = 0;
        }
    }

    /**
     * Activate a player after countdown ends (remove protection)
     */
    activatePlayer(socketId, player) {
        if (this.paddles[player.wall]) {
            this.paddles[player.wall].protected = false;
            console.log(`Player ${player.username} activated on wall ${player.wall}`);
        }
    }

    /**
     * Add a bot to the game mid-game
     */
    addBot(bot) {
        if (this.paddles[bot.wall]) {
            this.paddles[bot.wall].active = true;
            this.paddles[bot.wall].socketId = bot.id;
            this.paddles[bot.wall].name = bot.name;
            this.paddles[bot.wall].isBot = true;
            this.paddles[bot.wall].protected = false;
            this.paddles[bot.wall].score = 0;
            this.paddles[bot.wall].pos = 400; // Center position

            // Add bot to bots map for AI
            this.bots.set(bot.id, bot);
            console.log(`Bot ${bot.name} added to wall ${bot.wall}`);
        }
    }

    /**
     * Remove a bot from the game
     */
    removeBot(wall) {
        const paddle = this.paddles[wall];
        if (paddle && paddle.isBot) {
            this.bots.delete(paddle.socketId);
            paddle.active = false;
            paddle.isBot = false;
            console.log(`Bot removed from wall ${wall}`);
        }
    }

    getFinalScores() {
        return Object.values(this.paddles)
            .filter(p => p.active)
            .map(p => ({ username: p.name, score: p.score, isBot: p.isBot }));
    }
}

module.exports = GameEngine;
