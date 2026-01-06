export class InputHandler {
    constructor(onMove) {
        this.onMove = onMove;
        this.position = 400; // Center
        this.ARENA_SIZE = 800;
        this.isReversed = false;

        window.addEventListener('keydown', (e) => this.handleKeydown(e));
        // Also support mouse for smoother movement
        window.addEventListener('mousemove', (e) => this.handleMousemove(e));
    }

    setReversed(val) {
        this.isReversed = val;
    }

    handleKeydown(e) {
        let step = 20;
        if (this.isReversed) step *= -1;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a' || e.key === 'w') {
            this.position -= step;
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd' || e.key === 's') {
            this.position += step;
        }
        this.clamp();
        this.onMove(this.position);
    }

    handleMousemove(e) {
        // Handled via updateMousePosition from main.js for wall-specific logic
    }

    updateMousePosition(val) {
        if (this.isReversed) {
            // Invert relative to center
            this.position = this.ARENA_SIZE - val;
        } else {
            this.position = val;
        }
        this.clamp();
        this.onMove(this.position);
    }

    clamp() {
        const halfP = 50; // PADDLE_LENGTH / 2
        this.position = Math.max(halfP, Math.min(this.ARENA_SIZE - halfP, this.position));
    }
}
