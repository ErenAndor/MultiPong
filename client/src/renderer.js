export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.ARENA_SIZE = 800; // Logical size
        this.PADDLE_LENGTH = 100;
        this.PADDLE_WIDTH = 10;
        this.BALL_SIZE = 10;

        // Ensure logical size is set
        this.canvas.width = this.ARENA_SIZE;
        this.canvas.height = this.ARENA_SIZE;
    }

    draw(state, localPlayerWall = null, localPaddlePos = null) {
        const { balls, paddles, powerups, timeLeft } = state;
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, this.ARENA_SIZE, this.ARENA_SIZE);

        // Draw grid
        ctx.strokeStyle = '#151525';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.ARENA_SIZE; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, this.ARENA_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i); ctx.lineTo(this.ARENA_SIZE, i);
            ctx.stroke();
        }

        // Draw Timer (Background) - with dramatic countdown for last 10 seconds
        if (timeLeft !== undefined) {
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;

            if (timeLeft <= 10 && timeLeft > 0) {
                // Dramatic countdown for last 10 seconds
                const pulse = 1 + Math.sin(Date.now() / 100) * 0.15;
                ctx.save();
                ctx.fillStyle = timeLeft <= 3 ? '#ff4444' : '#fbbf24';
                ctx.font = `bold ${180 * pulse}px Outfit`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 30;
                ctx.fillText(`${timeLeft}`, this.ARENA_SIZE / 2, this.ARENA_SIZE / 2);
                ctx.restore();
            } else {
                // Normal timer display
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.font = 'bold 120px Outfit';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${mins}:${secs < 10 ? '0' : ''}${secs}`, this.ARENA_SIZE / 2, this.ARENA_SIZE / 2);
            }
        }

        // Draw Power-ups
        powerups.forEach(pu => {
            const size = 50;
            const pulse = 1 + Math.sin(Date.now() / 200) * 0.1;
            ctx.fillStyle = pu.type === 'speed' ? '#fbbf24' : pu.type === 'size' ? '#34d399' : '#f87171';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;

            ctx.beginPath();
            ctx.roundRect(pu.x - (size * pulse) / 2, pu.y - (size * pulse) / 2, size * pulse, size * pulse, 12);
            ctx.fill();

            // Icon
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 0;
            ctx.font = 'bold 24px Outfit';
            let label = '❓';
            if (pu.type === 'speed') label = '⚡';
            else if (pu.type === 'size') label = '↔️';
            else if (pu.type === 'fake') label = '🤡';
            else if (pu.type === 'blind') label = '🌑';
            else if (pu.type === 'reverse') label = '🔄';
            else if (pu.type === 'shield') label = '🛡️';

            ctx.fillText(label, pu.x, pu.y + 8);

            // Expiry Bar (simple visual feedback)
            if (pu.timeLeft) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                const barW = (pu.timeLeft / 8000) * (size * pulse);
                ctx.fillRect(pu.x - (size * pulse) / 2, pu.y + (size * pulse) / 2 + 5, barW, 4);
            }
        });

        // Draw Paddles & Info
        ctx.font = 'bold 16px Outfit';
        ctx.textAlign = 'center';

        // Helper to draw name/score
        const drawInfo = (name, score, x, y, rotation, color) => {
            if (!name) return;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rotation);
            ctx.fillStyle = color;
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'black';
            ctx.font = 'bold 20px Outfit';
            ctx.fillText(`${name}: ${score}`, 0, 0);
            ctx.restore();
        };

        const themeColor = '#646cff';
        const infoOffset = 80; // Distance from the wall

        const drawPaddle = (wall, paddle) => {
            if (!paddle.active) return;

            // Client-side prediction: use local position for local player
            let paddlePos = paddle.pos;
            if (wall === localPlayerWall && localPaddlePos !== null) {
                paddlePos = localPaddlePos;
            }

            const isHorizontal = wall === 'top' || wall === 'bottom';
            const x = isHorizontal ? paddlePos - paddle.len / 2 : (wall === 'left' ? 10 : this.ARENA_SIZE - this.PADDLE_WIDTH - 10);
            const y = isHorizontal ? (wall === 'top' ? 10 : this.ARENA_SIZE - this.PADDLE_WIDTH - 10) : paddlePos - paddle.len / 2;
            const w = isHorizontal ? paddle.len : this.PADDLE_WIDTH;
            const h = isHorizontal ? this.PADDLE_WIDTH : paddle.len;

            // Bot paddle color (yellow-orange)
            const paddleColor = paddle.isBot ? '#ffc107' : themeColor;
            ctx.fillStyle = paddleColor;
            ctx.shadowBlur = 10;
            ctx.shadowColor = paddleColor;

            // Protected Effect (joining player countdown)
            if (paddle.protected) {
                ctx.strokeStyle = '#34d399';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#34d399';
                ctx.shadowBlur = 15 + Math.sin(Date.now() / 200) * 5;
                ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
            }

            // Shield Effect
            if (paddle.effects && paddle.effects.shield) {
                ctx.strokeStyle = '#00f3ff';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#00f3ff';
                ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
            }

            // Confusion Aura
            if (paddle.effects && paddle.effects.reverse) {
                ctx.shadowColor = '#a855f7';
                ctx.shadowBlur = 20;
            }

            ctx.fillRect(x, y, w, h);

            // Draw Info with bot indicator - use paddlePos for instant position
            const infoX = isHorizontal ? paddlePos : (wall === 'left' ? infoOffset : this.ARENA_SIZE - infoOffset);
            const infoY = isHorizontal ? (wall === 'top' ? infoOffset : this.ARENA_SIZE - infoOffset) : paddlePos;
            const rotation = wall === 'left' ? -Math.PI / 2 : (wall === 'right' ? Math.PI / 2 : 0);
            drawInfo(paddle.name, paddle.score, infoX, infoY, rotation, paddleColor);
        };

        drawPaddle('bottom', paddles.bottom);
        drawPaddle('top', paddles.top);
        drawPaddle('left', paddles.left);
        drawPaddle('right', paddles.right);

        // Draw Balls
        balls.forEach(ball => {
            ctx.fillStyle = ball.color || '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, this.BALL_SIZE, 0, Math.PI * 2);
            ctx.fill();
        });

        // Final Overlay: Blindness
        const localUsername = document.getElementById('prof-name').textContent;
        const localPaddle = Object.values(paddles).find(p => p.name === localUsername);

        if (localPaddle && localPaddle.effects && localPaddle.effects.blind) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
            ctx.fillRect(0, 0, this.ARENA_SIZE, this.ARENA_SIZE);

            // Circular spotlight hole
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();

            let centerX = localPaddle.pos, centerY = this.ARENA_SIZE / 2;
            const wall = Object.keys(paddles).find(w => paddles[w].name === localUsername);

            if (wall === 'top') { centerX = localPaddle.pos; centerY = 30; }
            else if (wall === 'bottom') { centerX = localPaddle.pos; centerY = 770; }
            else if (wall === 'left') { centerX = 30; centerY = localPaddle.pos; }
            else if (wall === 'right') { centerX = 770; centerY = localPaddle.pos; }

            ctx.arc(centerX, centerY, 150, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.shadowBlur = 0;
    }

    /**
     * Draw the waiting/lobby screen with paddle positions
     */
    drawWaiting(players) {
        const ctx = this.ctx;

        // Clear and draw background
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, this.ARENA_SIZE, this.ARENA_SIZE);

        // Draw grid
        ctx.strokeStyle = '#151525';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.ARENA_SIZE; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, this.ARENA_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i); ctx.lineTo(this.ARENA_SIZE, i);
            ctx.stroke();
        }

        // Draw all 4 paddle positions (ready state)
        const paddlePositions = {
            bottom: { x: this.ARENA_SIZE / 2 - this.PADDLE_LENGTH / 2, y: this.ARENA_SIZE - this.PADDLE_WIDTH - 10, w: this.PADDLE_LENGTH, h: this.PADDLE_WIDTH },
            top: { x: this.ARENA_SIZE / 2 - this.PADDLE_LENGTH / 2, y: 10, w: this.PADDLE_LENGTH, h: this.PADDLE_WIDTH },
            left: { x: 10, y: this.ARENA_SIZE / 2 - this.PADDLE_LENGTH / 2, w: this.PADDLE_WIDTH, h: this.PADDLE_LENGTH },
            right: { x: this.ARENA_SIZE - this.PADDLE_WIDTH - 10, y: this.ARENA_SIZE / 2 - this.PADDLE_LENGTH / 2, w: this.PADDLE_WIDTH, h: this.PADDLE_LENGTH }
        };

        // Find which walls have players
        const occupiedWalls = {};
        players.forEach(p => {
            occupiedWalls[p.wall] = { name: p.username, isBot: p.isBot };
        });

        // Draw paddles
        Object.entries(paddlePositions).forEach(([wall, pos]) => {
            const player = occupiedWalls[wall];
            if (player) {
                ctx.fillStyle = player.isBot ? '#ffc107' : '#646cff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = ctx.fillStyle;
            } else {
                ctx.fillStyle = 'rgba(100, 108, 255, 0.2)';
                ctx.shadowBlur = 0;
            }
            ctx.fillRect(pos.x, pos.y, pos.w, pos.h);
        });

        ctx.shadowBlur = 0;

        // Draw center text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎮 Oyun Bekleniyor', this.ARENA_SIZE / 2, this.ARENA_SIZE / 2 - 50);

        ctx.font = '22px Outfit';
        ctx.fillStyle = '#646cff';
        ctx.fillText(`${players.length} / 4 oyuncu hazır`, this.ARENA_SIZE / 2, this.ARENA_SIZE / 2 + 10);

        if (players.length >= 2) {
            ctx.fillStyle = '#34d399';
            ctx.fillText('Host oyunu başlatabilir!', this.ARENA_SIZE / 2, this.ARENA_SIZE / 2 + 50);
        }

        // Draw player names near their paddles
        ctx.font = '14px Outfit';
        Object.entries(occupiedWalls).forEach(([wall, player]) => {
            ctx.fillStyle = player.isBot ? '#ffc107' : '#a78bfa';
            let textX, textY;
            switch (wall) {
                case 'bottom': textX = this.ARENA_SIZE / 2; textY = this.ARENA_SIZE - 50; break;
                case 'top': textX = this.ARENA_SIZE / 2; textY = 50; break;
                case 'left': textX = 60; textY = this.ARENA_SIZE / 2; break;
                case 'right': textX = this.ARENA_SIZE - 60; textY = this.ARENA_SIZE / 2; break;
            }
            ctx.fillText(player.name + (player.isBot ? ' 🤖' : ''), textX, textY);
        });
    }

    /**
     * Clear the canvas to default state
     */
    clear() {
        const ctx = this.ctx;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, this.ARENA_SIZE, this.ARENA_SIZE);

        // Draw grid
        ctx.strokeStyle = '#151525';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.ARENA_SIZE; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, this.ARENA_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i); ctx.lineTo(this.ARENA_SIZE, i);
            ctx.stroke();
        }
    }
}

