const GameEngine = require('./GameEngine');
const BotPlayer = require('./BotPlayer');

class RoomManager {
    constructor(io, activeUsers) {
        this.io = io;
        this.activeUsers = activeUsers;
        this.rooms = new Map();
    }

    createRoom(roomId, hostId, password = null, duration = 3, botDifficulty = 'hard') {
        if (this.rooms.has(roomId)) {
            throw new Error('Room already exists');
        }

        const room = {
            id: roomId,
            hostId: hostId,
            password: password,
            duration: duration,
            botDifficulty: botDifficulty, // Bot difficulty level
            players: new Map(),
            bots: new Map(), // Bot players
            walls: { top: null, bottom: null, left: null, right: null },
            gameState: 'waiting',
            gameEngine: null,
            joiningPlayers: new Map() // Players in countdown phase
        };

        this.rooms.set(roomId, room);
        console.log(`Lobby created: ${roomId} by host: ${hostId}, duration: ${duration}m, bot difficulty: ${botDifficulty}`);

        return room;
    }

    /**
     * Add 3 bots to fill empty walls after host joins
     */
    addBotsToRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const walls = ['top', 'bottom', 'left', 'right'];
        let botNumber = 1;

        walls.forEach(wall => {
            if (!room.walls[wall] && botNumber <= 3) {
                const bot = new BotPlayer(wall, `Bot ${botNumber}`, room.botDifficulty);
                room.bots.set(bot.id, bot);
                room.walls[wall] = bot.id;
                botNumber++;
            }
        });

        console.log(`Added ${botNumber - 1} bots to room ${roomId}`);
        this.broadcastPlayerList(roomId);
    }

    /**
     * Remove a random bot and return the wall it was on
     */
    removeRandomBot(room) {
        const botIds = Array.from(room.bots.keys());
        if (botIds.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * botIds.length);
        const botId = botIds[randomIndex];
        const bot = room.bots.get(botId);

        if (bot) {
            room.walls[bot.wall] = null;
            room.bots.delete(botId);
            console.log(`Removed ${bot.name} from wall ${bot.wall}`);
            return bot.wall;
        }
        return null;
    }

    /**
     * Add a bot to an empty wall
     */
    addBotToEmptyWall(room) {
        const walls = ['top', 'bottom', 'left', 'right'];
        const emptyWall = walls.find(w => !room.walls[w]);

        if (emptyWall) {
            const existingBotNumbers = Array.from(room.bots.values()).map(b => {
                const match = b.name.match(/Bot (\d+)/);
                return match ? parseInt(match[1]) : 0;
            });

            let newBotNumber = 1;
            while (existingBotNumbers.includes(newBotNumber)) {
                newBotNumber++;
            }

            const bot = new BotPlayer(emptyWall, `Bot ${newBotNumber}`, room.botDifficulty);
            room.bots.set(bot.id, bot);
            room.walls[emptyWall] = bot.id;

            // If game is running, add bot to game engine
            if (room.gameEngine) {
                room.gameEngine.addBot(bot);
            }

            console.log(`Added ${bot.name} to wall ${emptyWall}`);
            return bot;
        }
        return null;
    }

    joinRoom(roomId, socketId, username, password = null) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        if (room.password && room.password !== password) {
            throw new Error('Invalid password');
        }

        // Count real players (excluding bots)
        const realPlayerCount = room.players.size;
        if (realPlayerCount >= 4) {
            throw new Error('Room is full');
        }

        let wall;
        const isGameRunning = room.gameState === 'playing';

        // If there are bots, remove one and take its wall
        if (room.bots.size > 0) {
            wall = this.removeRandomBot(room);
        } else {
            wall = this.assignWall(room);
        }

        if (!wall) {
            throw new Error('No available walls');
        }

        const player = {
            id: socketId,
            username,
            wall,
            isBot: false,
            countdown: isGameRunning ? 3 : 0 // 3 second countdown if joining mid-game
        };

        room.players.set(socketId, player);
        room.walls[wall] = socketId;

        console.log(`User ${username} joined room ${roomId} assigned to ${wall}${isGameRunning ? ' (with countdown)' : ''}`);

        // If game is running, handle mid-game join
        if (isGameRunning && room.gameEngine) {
            room.joiningPlayers.set(socketId, {
                player,
                countdown: 3,
                startTime: Date.now()
            });

            room.gameEngine.addJoiningPlayer(player);

            // Start countdown
            this.startJoinCountdown(roomId, socketId);
        }

        // Broadcast updates
        this.broadcastPlayerList(roomId);
        const roomData = this.getRoomData(roomId);
        this.io.to(roomId).emit('roomUpdate', roomData);

        return { room, player };
    }

    startJoinCountdown(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const joining = room.joiningPlayers.get(socketId);
        if (!joining) return;

        // Emit countdown event
        this.io.to(roomId).emit('playerJoining', {
            playerId: socketId,
            username: joining.player.username,
            wall: joining.player.wall,
            countdown: joining.countdown
        });

        const countdownInterval = setInterval(() => {
            const currentRoom = this.rooms.get(roomId);
            if (!currentRoom) {
                clearInterval(countdownInterval);
                return;
            }

            const joiningPlayer = currentRoom.joiningPlayers.get(socketId);
            if (!joiningPlayer) {
                clearInterval(countdownInterval);
                return;
            }

            joiningPlayer.countdown--;

            this.io.to(roomId).emit('playerJoining', {
                playerId: socketId,
                username: joiningPlayer.player.username,
                wall: joiningPlayer.player.wall,
                countdown: joiningPlayer.countdown
            });

            if (joiningPlayer.countdown <= 0) {
                clearInterval(countdownInterval);
                currentRoom.joiningPlayers.delete(socketId);

                // Activate player in game engine
                if (currentRoom.gameEngine) {
                    currentRoom.gameEngine.activatePlayer(socketId, joiningPlayer.player);
                }

                // Update player countdown status
                const player = currentRoom.players.get(socketId);
                if (player) {
                    player.countdown = 0;
                }

                this.broadcastPlayerList(roomId);
                this.io.to(roomId).emit('playerJoined', joiningPlayer.player);
            }
        }, 1000);
    }

    startGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Combine real players and bots for game
        const allPlayers = [
            ...Array.from(room.players.values()),
            ...Array.from(room.bots.values()).map(bot => ({
                id: bot.id,
                username: bot.name,
                wall: bot.wall,
                isBot: true
            }))
        ];

        if (allPlayers.length < 2) {
            throw new Error('Not enough players');
        }

        room.gameState = 'playing';
        room.gameEngine = new GameEngine(roomId, this.io, () => {
            // On Game Over
            room.gameState = 'waiting';
            room.gameEngine = null;
        }, this.activeUsers, room.duration, room.bots);

        room.gameEngine.init(allPlayers);
        room.gameEngine.start();

        this.io.to(roomId).emit('gameStarted');
    }

    handleInput(roomId, socketId, data) {
        const room = this.rooms.get(roomId);
        if (room && room.gameState === 'playing' && room.gameEngine) {
            // Don't accept input from players in countdown
            if (room.joiningPlayers.has(socketId)) return;
            room.gameEngine.updatePaddle(socketId, data.position);
        }
    }

    leaveRoom(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.get(socketId);
        if (player) {
            room.walls[player.wall] = null;
            room.players.delete(socketId);
            room.joiningPlayers.delete(socketId);

            // If game is running, deactivate in engine and add a bot
            if (room.gameEngine && room.gameEngine.paddles[player.wall]) {
                room.gameEngine.paddles[player.wall].active = false;
            }

            // Add a bot to replace the leaving player
            if (room.gameState === 'playing' || room.gameState === 'waiting') {
                const newBot = this.addBotToEmptyWall(room);
                if (newBot) {
                    this.broadcastPlayerList(roomId);
                }
            }
        }

        // Only delete room if no real players left
        if (room.players.size === 0) {
            if (room.gameEngine) room.gameEngine.stop();
            this.rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (no real players)`);
        }

        return room;
    }

    assignWall(room) {
        if (!room.walls.bottom) return 'bottom';
        if (!room.walls.top) return 'top';
        if (!room.walls.left) return 'left';
        if (!room.walls.right) return 'right';
        return null;
    }

    broadcastPlayerList(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const playerList = [
            ...Array.from(room.players.values()).map(p => ({
                id: p.id,
                username: p.username,
                wall: p.wall,
                isBot: false,
                countdown: p.countdown || 0
            })),
            ...Array.from(room.bots.values()).map(bot => ({
                id: bot.id,
                username: bot.name,
                wall: bot.wall,
                isBot: true,
                countdown: 0
            }))
        ];

        this.io.to(roomId).emit('playerListUpdate', playerList);
    }

    getRoomData(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const allPlayers = [
            ...Array.from(room.players.values()).map(p => ({
                ...p,
                isBot: false
            })),
            ...Array.from(room.bots.values()).map(bot => ({
                id: bot.id,
                username: bot.name,
                wall: bot.wall,
                isBot: true
            }))
        ];

        return {
            id: room.id,
            hostId: room.hostId,
            gameState: room.gameState,
            players: allPlayers,
            hasPassword: !!room.password
        };
    }

    getRooms() {
        return Array.from(this.rooms.values()).map(r => ({
            id: r.id,
            hasPassword: !!r.password,
            playerCount: r.players.size, // Only count real players
            botCount: r.bots.size,
            gameState: r.gameState
        }));
    }
}

module.exports = RoomManager;
