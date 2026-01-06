export class UI {
    constructor(socket, onJoinRoom, onLeaveRoom) {
        this.socket = socket;
        this.onJoinRoom = onJoinRoom;
        this.onLeaveRoom = onLeaveRoom;

        // Elements
        this.loginScreen = document.getElementById('login-screen');
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.createRoomModal = document.getElementById('create-room-modal');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');

        this.usernameInput = document.getElementById('username-input');
        this.passwordInput = document.getElementById('password-input');
        this.loginBtn = document.getElementById('login-btn');
        this.registerBtn = document.getElementById('register-btn');
        this.guestBtn = document.getElementById('guest-btn');

        this.createRoomBtn = document.getElementById('create-room-btn');
        this.refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
        this.roomList = document.getElementById('room-list');
        this.leaderboardList = document.getElementById('global-leaderboard');
        this.logoutBtn = document.getElementById('logout-btn');

        this.confirmCreateBtn = document.getElementById('confirm-create-btn');
        this.cancelCreateBtn = document.getElementById('cancel-create-btn');
        this.newRoomId = document.getElementById('new-room-id');
        this.newRoomPassword = document.getElementById('new-room-password');

        this.user = null; // { username, isGuest, high_score, total_goals }

        this.initListeners();
    }

    initListeners() {
        this.loginBtn.addEventListener('click', () => this.handleAuth('login'));
        this.registerBtn.addEventListener('click', () => this.handleAuth('register'));
        this.guestBtn.addEventListener('click', () => this.handleAuth('guest'));

        // Enter key for login
        const loginOnEnter = (e) => {
            if (e.key === 'Enter') this.handleAuth('login');
        };
        this.usernameInput.addEventListener('keydown', loginOnEnter);
        this.passwordInput.addEventListener('keydown', loginOnEnter);

        this.createRoomBtn.addEventListener('click', () => {
            this.createRoomModal.classList.remove('hidden');
        });

        this.cancelCreateBtn.addEventListener('click', () => {
            this.createRoomModal.classList.add('hidden');
        });

        this.confirmCreateBtn.addEventListener('click', () => {
            const roomId = this.newRoomId.value.trim();
            const password = this.newRoomPassword.value.trim() || null;
            const durationInput = document.getElementById('match-duration');
            const duration = parseInt(durationInput.value);
            const botDifficulty = document.getElementById('bot-difficulty').value;

            if (!roomId) {
                alert('Please enter a lobby name.');
                return;
            }

            if (isNaN(duration) || duration < 1 || duration > 5) {
                alert('Duration must be between 1 and 5 minutes.');
                return;
            }

            this.socket.emit('createRoom', { roomId, password, duration, botDifficulty }, (res) => {
                if (res.success) {
                    this.newRoomId.value = '';
                    this.newRoomPassword.value = '';
                    this.createRoomModal.classList.add('hidden');
                    this.joinRoom(roomId, password);
                } else {
                    alert('Error creating lobby: ' + res.message);
                }
            });
        });

        this.refreshRoomsBtn.addEventListener('click', () => {
            this.socket.emit('getRooms', (rooms) => this.renderRoomList(rooms));
            this.fetchLeaderboard();
        });

        this.logoutBtn.addEventListener('click', () => {
            // Simply reload or reset state
            window.location.reload();
        });

        this.leaveRoomBtn.addEventListener('click', () => {
            const roomId = document.getElementById('room-info').textContent.replace('Lobby: ', '');
            this.socket.emit('leaveRoom', { roomId });
            if (this.onLeaveRoom) this.onLeaveRoom();
            this.showLobby();
        });
    }

    handleAuth(type) {
        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value.trim();

        if (!username) return alert('Username is required');

        if (type === 'guest') {
            this.socket.emit('login', { username: `Guest_${username}`, isGuest: true }, (res) => {
                if (res.success) {
                    this.user = res.user;
                    this.showLobby();
                }
            });
        } else if (type === 'register') {
            if (!password) return alert('Password is required for registration');
            this.socket.emit('register', { username, password }, (res) => {
                if (res.success) {
                    alert('Registration successful! Please login.');
                } else {
                    alert(res.message);
                }
            });
        } else {
            if (!password) return alert('Password is required');
            this.socket.emit('login', { username, password, isGuest: false }, (res) => {
                if (res.success) {
                    this.user = res.user;
                    this.showLobby();
                } else {
                    alert(res.message);
                }
            });
        }
    }

    showLobby() {
        this.loginScreen.classList.add('hidden');
        this.lobbyScreen.classList.remove('hidden');
        this.gameScreen.classList.add('hidden');

        this.renderProfile();
        this.socket.emit('getRooms', (rooms) => this.renderRoomList(rooms));
        this.fetchLeaderboard();
    }

    renderProfile() {
        document.getElementById('prof-name').textContent = this.user.username;
        document.getElementById('prof-hs').textContent = this.user.high_score;
        document.getElementById('prof-tg').textContent = this.user.total_goals;
        // Level simple logic: goals / 10 + 1
        const level = Math.floor(this.user.total_goals / 10) + 1;
        document.getElementById('prof-level').textContent = level;

        // Dynamic button text
        this.logoutBtn.textContent = this.user.isGuest ? 'Exit to Login' : 'Logout';
    }

    fetchLeaderboard() {
        this.socket.emit('getLeaderboard', (data) => {
            this.leaderboardList.innerHTML = '';
            data.forEach((item, i) => {
                const div = document.createElement('div');
                div.className = 'lb-item';
                div.innerHTML = `<span>${i + 1}. ${item.username}</span> <span>${item.high_score}</span>`;
                this.leaderboardList.appendChild(div);
            });
        });
    }

    renderRoomList(rooms) {
        this.roomList.innerHTML = '';
        if (rooms.length === 0) {
            this.roomList.innerHTML = '<p style="padding:10px; color:#888;">No lobbies available.</p>';
            return;
        }

        rooms.forEach((room) => {
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `<span>${room.id} (${room.playerCount}/4) ${room.hasPassword ? '🔒' : ''}</span>`;

            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Join';
            joinBtn.addEventListener('click', () => {
                let password = null;
                if (room.hasPassword) {
                    password = prompt('Enter room password:');
                    if (password === null) return;
                }
                this.joinRoom(room.id, password);
            });

            div.appendChild(joinBtn);
            this.roomList.appendChild(div);
        });
    }

    joinRoom(roomId, password) {
        this.socket.emit('joinRoom', { roomId, username: this.user.username, password }, (res) => {
            if (res.success) {
                this.onJoinRoom(res.room, res.player);
                this.showGame(res.room.id);
            } else {
                alert('Failed to join: ' + res.message);
            }
        });
    }

    showGame(roomId) {
        this.lobbyScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        document.getElementById('room-info').textContent = `Lobby: ${roomId}`;
    }

    /**
     * Render the player list panel with bots and real players
     */
    renderPlayerList(players) {
        const playerList = document.getElementById('player-list');
        if (!playerList) return;

        playerList.innerHTML = '';

        // Sort by score (highest first), if scores exist; otherwise by bot/player
        const sortedPlayers = [...players].sort((a, b) => {
            // If both have scores, sort by score descending
            if (a.score !== undefined && b.score !== undefined) {
                return b.score - a.score;
            }
            // Otherwise, real players first
            if (a.isBot && !b.isBot) return 1;
            if (!a.isBot && b.isBot) return -1;
            return 0;
        });

        sortedPlayers.forEach((player, index) => {
            const li = document.createElement('li');

            // Add classes based on player type
            if (player.isBot) {
                li.classList.add('is-bot');
            }
            if (player.countdown > 0) {
                li.classList.add('is-countdown');
            }

            // Player name with score and effects
            const nameContainer = document.createElement('div');
            nameContainer.style.display = 'flex';
            nameContainer.style.alignItems = 'center';
            nameContainer.style.gap = '4px';

            // Rank indicator (1st, 2nd, etc.)
            if (player.score !== undefined) {
                const rankSpan = document.createElement('span');
                rankSpan.style.fontSize = '0.8rem';
                rankSpan.style.color = index === 0 ? '#fbbf24' : 'rgba(255,255,255,0.4)';
                rankSpan.textContent = `${index + 1}.`;
                nameContainer.appendChild(rankSpan);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.username;
            nameContainer.appendChild(nameSpan);

            // Show score if available
            if (player.score !== undefined) {
                const scoreSpan = document.createElement('span');
                scoreSpan.style.fontSize = '0.75rem';
                scoreSpan.style.color = player.score >= 0 ? '#34d399' : '#f87171';
                scoreSpan.style.fontWeight = 'bold';
                scoreSpan.textContent = `(${player.score})`;
                nameContainer.appendChild(scoreSpan);
            }

            // Show active effects if any
            if (player.effects) {
                const effectsSpan = document.createElement('span');
                effectsSpan.className = 'player-effects';
                if (player.effects.shield) effectsSpan.innerHTML += '<span class="effect-icon" title="Shield">🛡️</span>';
                if (player.effects.blind) effectsSpan.innerHTML += '<span class="effect-icon" title="Blind">🌑</span>';
                if (player.effects.reverse) effectsSpan.innerHTML += '<span class="effect-icon" title="Reverse">🔄</span>';
                if (effectsSpan.innerHTML) {
                    nameContainer.appendChild(effectsSpan);
                }
            }

            const infoDiv = document.createElement('div');
            infoDiv.style.display = 'flex';
            infoDiv.style.flexDirection = 'column';
            infoDiv.style.alignItems = 'flex-end';
            infoDiv.style.gap = '2px';

            const wallSpan = document.createElement('span');
            wallSpan.className = 'player-wall';
            wallSpan.textContent = player.wall;

            const indicator = document.createElement('span');
            indicator.className = 'player-indicator';
            if (player.countdown > 0) {
                indicator.textContent = `${player.countdown}s`;
            } else if (player.isBot) {
                indicator.textContent = 'BOT';
            } else {
                indicator.textContent = 'Oyuncu';
            }

            infoDiv.appendChild(indicator);
            infoDiv.appendChild(wallSpan);

            li.appendChild(nameContainer);
            li.appendChild(infoDiv);
            playerList.appendChild(li);
        });
    }

    /**
     * Show countdown overlay for joining player
     */
    showCountdown(countdown) {
        const overlay = document.getElementById('countdown-overlay');
        const number = document.getElementById('countdown-number');

        if (overlay && number) {
            number.textContent = countdown;
            overlay.classList.remove('hidden');
        }
    }

    /**
     * Hide countdown overlay
     */
    hideCountdown() {
        const overlay = document.getElementById('countdown-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
}
