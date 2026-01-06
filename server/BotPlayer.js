/**
 * BotPlayer - AI-controlled paddle for AndorPong
 * Tracks the ball and moves the paddle accordingly with some randomness for natural feel
 */

// Difficulty settings - MUCH bigger differences now
const DIFFICULTY_SETTINGS = {
    low: {
        reactionDelayMin: 300,
        reactionDelayMax: 500,
        accuracyMin: 0.2,
        accuracyMax: 0.4,
        moveSpeed: 0.03,
        predictionError: 150,
        missChance: 0.25 // 25% chance to intentionally miss
    },
    medium: {
        reactionDelayMin: 150,
        reactionDelayMax: 250,
        accuracyMin: 0.5,
        accuracyMax: 0.7,
        moveSpeed: 0.07,
        predictionError: 70,
        missChance: 0.10 // 10% chance to intentionally miss
    },
    hard: {
        reactionDelayMin: 30,
        reactionDelayMax: 80,
        accuracyMin: 0.85,
        accuracyMax: 0.95,
        moveSpeed: 0.18,
        predictionError: 15,
        missChance: 0.02 // 2% chance to miss
    }
};

class BotPlayer {
    constructor(wall, name, difficulty = 'hard') {
        this.wall = wall;
        this.name = name;
        this.isBot = true;
        this.difficulty = difficulty;
        this.id = `bot_${wall}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        // Get difficulty settings
        const settings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.hard;

        // AI behavior settings based on difficulty
        this.reactionDelay = settings.reactionDelayMin + Math.random() * (settings.reactionDelayMax - settings.reactionDelayMin);
        this.accuracy = settings.accuracyMin + Math.random() * (settings.accuracyMax - settings.accuracyMin);
        this.moveSpeed = settings.moveSpeed;
        this.predictionError = settings.predictionError;
        this.missChance = settings.missChance;

        this.lastMoveTime = 0;
        this.targetPosition = 400; // Start at center
        this.currentPosition = 400;
        this.lastDecisionTime = 0;
        this.shouldMissThisShot = false;
    }

    /**
     * Calculate the target paddle position based on ball position
     * @param {Array} balls - Array of ball objects with x, y, vx, vy
     * @param {number} arenaSize - Size of the arena (800)
     * @returns {number} Target paddle position
     */
    calculateMove(balls, arenaSize = 800) {
        if (!balls || balls.length === 0) {
            return this.currentPosition;
        }

        // Find the main ball (not a decoy)
        const mainBall = balls.find(b => !b.isDecoy) || balls[0];

        // Determine if ball is coming towards this wall
        const isHorizontal = this.wall === 'top' || this.wall === 'bottom';

        // Check if ball is moving towards this wall
        let isBallApproaching = false;
        if (this.wall === 'top' && mainBall.vy < 0) isBallApproaching = true;
        if (this.wall === 'bottom' && mainBall.vy > 0) isBallApproaching = true;
        if (this.wall === 'left' && mainBall.vx < 0) isBallApproaching = true;
        if (this.wall === 'right' && mainBall.vx > 0) isBallApproaching = true;

        const now = Date.now();

        if (isBallApproaching) {
            // Decide once per approach if we should miss
            if (now - this.lastDecisionTime > 500) {
                this.shouldMissThisShot = Math.random() < this.missChance;
                this.lastDecisionTime = now;
            }

            if (this.shouldMissThisShot) {
                // Intentionally move to wrong position
                const wrongDirection = Math.random() > 0.5 ? 150 : -150;
                this.targetPosition = arenaSize / 2 + wrongDirection;
            } else {
                // Predict where ball will be when it reaches this wall
                const predictedPos = this.predictBallPosition(mainBall, arenaSize);

                // Add inaccuracy based on difficulty (much larger for low)
                const inaccuracy = (Math.random() - 0.5) * this.predictionError * 2;
                this.targetPosition = Math.max(50, Math.min(arenaSize - 50, predictedPos + inaccuracy));
            }
        } else {
            // Ball going away - slowly move towards center
            const centerDrift = this.difficulty === 'hard' ? 0.02 : (this.difficulty === 'medium' ? 0.008 : 0.003);
            this.targetPosition = this.targetPosition * (1 - centerDrift) + (arenaSize / 2) * centerDrift;
            this.shouldMissThisShot = false; // Reset for next approach
        }

        // Smooth movement towards target (speed based on difficulty)
        // Add some jitter for low difficulty
        let jitter = 0;
        if (this.difficulty === 'low') {
            jitter = (Math.random() - 0.5) * 5;
        } else if (this.difficulty === 'medium') {
            jitter = (Math.random() - 0.5) * 2;
        }

        this.currentPosition += (this.targetPosition - this.currentPosition) * this.moveSpeed + jitter;

        return this.currentPosition;
    }

    /**
     * Predict where the ball will intersect with this wall
     */
    predictBallPosition(ball, arenaSize) {
        const isHorizontal = this.wall === 'top' || this.wall === 'bottom';

        let x = ball.x;
        let y = ball.y;
        let vx = ball.vx;
        let vy = ball.vy;

        // For low difficulty, use simpler (worse) prediction
        if (this.difficulty === 'low') {
            // Just use current ball position with big error
            return (isHorizontal ? ball.x : ball.y) + (Math.random() - 0.5) * 200;
        }

        // Simulate ball movement until it reaches this wall
        const maxIterations = this.difficulty === 'medium' ? 300 : 1000;
        const dt = 1 / 60;

        for (let i = 0; i < maxIterations; i++) {
            x += vx * dt;
            y += vy * dt;

            // Bounce off other walls
            if (x <= 10 || x >= arenaSize - 10) {
                vx *= -1;
                x = Math.max(10, Math.min(arenaSize - 10, x));
            }
            if (y <= 10 || y >= arenaSize - 10) {
                vy *= -1;
                y = Math.max(10, Math.min(arenaSize - 10, y));
            }

            // Check if ball reached this wall
            if (this.wall === 'top' && y <= 20) return x;
            if (this.wall === 'bottom' && y >= arenaSize - 20) return x;
            if (this.wall === 'left' && x <= 20) return y;
            if (this.wall === 'right' && x >= arenaSize - 20) return y;
        }

        // Fallback: return current ball position
        return isHorizontal ? ball.x : ball.y;
    }
}

module.exports = BotPlayer;
