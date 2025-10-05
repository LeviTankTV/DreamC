class GameClient {
    constructor() {
        this.app = null;
        this.ws = null;
        this.gameState = {
            players: {},
            myId: null,
            worldSize: 7000, // Updated for all zones
            worldHeight: 1000
        };

        // PixiJS containers
        this.worldContainer = null;
        this.playersContainer = null;
        this.minimapContainer = null;
        this.portalsContainer = null;
        this.gridGraphics = null;
        this.worldBorder = null;

        this.playerRadius = 15;
        this.keys = {};
        this.camera = { x: 0, y: 0 };
        this.gameLoopInterval = null;
        this.lastUpdateTime = 0;
        this.fps = 60;
        this.frameTime = 1000 / this.fps;

        // Player texture
        this.playerTexture = null;
        this.playerSprites = {};

        // Portal animations
        this.portalTextures = {};
        this.portalSprites = {};
        this.portalAnimations = {};

        this.authToken = localStorage.getItem('authToken');
        this.username = localStorage.getItem('username');

        // Define zones
        this.zones = {
            common: { x: 0, width: 1000, color: 0x666666, name: "Common Zone" },
            uncommon: { x: 1500, width: 1000, color: 0x00FF00, name: "Uncommon Zone" },
            rare: { x: 3000, width: 1000, color: 0x0088FF, name: "Rare Zone" },
            epic: { x: 4500, width: 1000, color: 0xFF00FF, name: "Epic Zone" },
            legendary: { x: 6000, width: 1000, color: 0xFFAA00, name: "Legendary Zone" }
        };

        // Define portals
        this.portals = [
            { id: 'P1', x: 800, y: 500, zone: 'common' },
            { id: 'P2', x: 1700, y: 500, zone: 'uncommon' },
            { id: 'P3', x: 2300, y: 500, zone: 'uncommon' },
            { id: 'P4', x: 3200, y: 500, zone: 'rare' },
            { id: 'P5', x: 3800, y: 500, zone: 'rare' },
            { id: 'P6', x: 4700, y: 500, zone: 'epic' },
            { id: 'P7', x: 5300, y: 500, zone: 'epic' },
            { id: 'P8', x: 6200, y: 500, zone: 'legendary' }
        ];
    }

    async init() {
        const loadingOverlay = document.getElementById('loadingOverlay');

        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
        }

        // Initialize Pixi app but don't start game systems yet
        await this.setupPixiApp();

        this.setupControls();
        this.setupAuthHandlers();

        if (this.authToken && this.username) {
            document.getElementById('authOverlay').style.display = 'none';
            // Show main menu since user is authenticated
            document.getElementById('main-menu').style.display = 'flex';
        } else {
            this.showAuth();
            // Hide main menu if not authenticated
            document.getElementById('main-menu').style.display = 'none';
        }

        console.log('Game client initialized with Pixi.js');

        setTimeout(() => {
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
                setTimeout(() => {
                    if (loadingOverlay.parentNode) {
                        loadingOverlay.style.display = 'none';
                    }
                }, 400);
            }
        }, 1000);
    }



    async setupPixiApp() {
        try {
            this.app = new PIXI.Application();
            await this.app.init({
                width: window.innerWidth,
                height: window.innerHeight,
                backgroundColor: 0x000000,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                antialias: true,
                transparent: true
            });

            const bgTexture = await PIXI.Assets.load('assets/bg.png');
            const bgSprite = new PIXI.Sprite(bgTexture);
            bgSprite.width = this.app.screen.width;
            bgSprite.height = this.app.screen.height;
            this.app.stage.addChild(bgSprite);

            document.getElementById('pixi-container').appendChild(this.app.canvas);

            // Load player texture
            this.playerTexture = await PIXI.Assets.load('assets/fl.png');

            // Load portal textures
            await this.loadPortalTextures();

            // Create containers
            this.worldContainer = new PIXI.Container();
            this.playersContainer = new PIXI.Container();
            this.minimapContainer = new PIXI.Container();
            this.portalsContainer = new PIXI.Container();

            this.app.stage.addChild(this.worldContainer);
            this.worldContainer.addChild(this.portalsContainer);
            this.worldContainer.addChild(this.playersContainer);

            this.drawFixedGrid();
            this.setupMinimap();
            this.createPortals();

            window.addEventListener('resize', () => this.resizeApp());

            console.log('PixiJS application initialized with zones and portals');
        } catch (error) {
            console.error('Failed to initialize PixiJS:', error);
            throw error;
        }
    }

    async loadPortalTextures() {
        const texturePromises = [];
        for (let i = 1; i <= 8; i++) {
            texturePromises.push(
                PIXI.Assets.load(`assets/portal/Portalf${i}.png`).then(texture => {
                    this.portalTextures[`frame${i}`] = texture;
                })
            );
        }
        await Promise.all(texturePromises);
        console.log('All portal textures loaded');
    }

    createPortals() {
        this.portals.forEach(portal => {
            // Create animated sprite from portal textures
            const frames = [];
            for (let i = 1; i <= 8; i++) {
                frames.push(this.portalTextures[`frame${i}`]);
            }

            const portalSprite = new PIXI.AnimatedSprite(frames);
            portalSprite.anchor.set(0.5);
            portalSprite.x = portal.x;
            portalSprite.y = portal.y;

            // Scale portal to radius 100
            const baseSize = Math.max(portalSprite.width, portalSprite.height);
            const scale = (100 * 2) / baseSize;
            portalSprite.scale.set(scale);

            portalSprite.animationSpeed = 0.3; // 0.1s delay between frames
            portalSprite.play();

            this.portalSprites[portal.id] = portalSprite;
            this.portalsContainer.addChild(portalSprite);

            // Add portal ID text
            const portalText = new PIXI.Text(portal.id, {
                fontFamily: 'Arial',
                fontSize: 16,
                fill: 0xFFFFFF,
                align: 'center',
                stroke: 0x000000,
                strokeThickness: 4
            });
            portalText.anchor.set(0.5);
            portalText.y = -80;
            portalSprite.addChild(portalText);
        });
    }

    setupWorldVisuals() {
        this.worldBorderElement = document.createElement('div');
        this.worldBorderElement.className = 'world-border';
        document.getElementById('game-container').appendChild(this.worldBorderElement);
    }

    drawWorldSquare() {
        // Clear previous graphics
        if (this.worldBorder) {
            this.worldContainer.removeChild(this.worldBorder);
        }

        this.worldBorder = new PIXI.Graphics();

        // Draw zones with different colors
        Object.values(this.zones).forEach(zone => {
            this.worldBorder.beginFill(zone.color, 0.3);
            this.worldBorder.drawRect(zone.x, 0, zone.width, this.gameState.worldHeight);
            this.worldBorder.endFill();

            // Draw zone borders
            this.worldBorder.lineStyle(3, zone.color, 0.7);
            this.worldBorder.drawRect(zone.x, 0, zone.width, this.gameState.worldHeight);
        });

        // Draw world border
        this.worldBorder.lineStyle(5, 0xFFFFFF, 1);
        this.worldBorder.drawRect(0, 0, this.gameState.worldWidth, this.gameState.worldHeight);

        this.worldContainer.addChildAt(this.worldBorder, 0);

        // Add zone labels
        this.drawZoneLabels();
    }

    drawZoneLabels() {
        // Remove old labels
        if (this.zoneLabels) {
            this.zoneLabels.forEach(label => this.worldContainer.removeChild(label));
        }

        this.zoneLabels = [];

        Object.values(this.zones).forEach(zone => {
            const label = new PIXI.Text(zone.name, {
                fontFamily: 'Arial',
                fontSize: 24,
                fill: 0xFFFFFF,
                align: 'center',
                stroke: 0x000000,
                strokeThickness: 4
            });
            label.anchor.set(0.5);
            label.x = zone.x + zone.width / 2;
            label.y = 50;
            this.worldContainer.addChild(label);
            this.zoneLabels.push(label);
        });
    }


    drawFixedGrid() {
        if (this.fixedGrid) {
            this.app.stage.removeChild(this.fixedGrid);
        }

        this.fixedGrid = new PIXI.Graphics();
        this.fixedGrid.lineStyle(1, 0x444444, 0.3);

        const gridSize = 50;
        const screenWidth = this.app.screen.width;
        const screenHeight = this.app.screen.height;

        // Draw vertical lines
        for (let x = -screenWidth; x <= screenWidth * 2; x += gridSize) {
            this.fixedGrid.moveTo(x, -screenHeight);
            this.fixedGrid.lineTo(x, screenHeight * 2);
        }

        // Draw horizontal lines
        for (let y = -screenHeight; y <= screenHeight * 2; y += gridSize) {
            this.fixedGrid.moveTo(-screenWidth, y);
            this.fixedGrid.lineTo(screenWidth * 2, y);
        }

        this.app.stage.addChild(this.fixedGrid);
    }

    drawPlayers() {
        const currentSprites = new Set();

        Object.values(this.gameState.players).forEach(player => {
            if (player.x < 0 || player.x > this.gameState.worldSize ||
                player.y < 0 || player.y > this.gameState.worldHeight) {
                return;
            }

            const playerId = player.id;
            currentSprites.add(playerId);

            let playerSprite = this.playerSprites[playerId];
            if (!playerSprite) {
                playerSprite = new PIXI.Sprite(this.playerTexture);
                playerSprite.anchor.set(0.5);

                const textureWidth = this.playerTexture.width;
                const desiredDiameter = this.playerRadius * 2;
                const scale = desiredDiameter / textureWidth;

                playerSprite.scale.set(scale);

                this.playerSprites[playerId] = playerSprite;
                this.playersContainer.addChild(playerSprite);
            }

            playerSprite.x = player.x;
            playerSprite.y = player.y;

            // Render username
            let playerText = playerSprite.getChildByName('playerText');
            const displayName = player.username || player.id.substring(0, 8);

            if (!playerText) {
                playerText = new PIXI.Text(displayName, {
                    fontFamily: 'Arial',
                    fontSize: 12,
                    fill: 0xFFFFFF,
                    align: 'center',
                    stroke: 0x000000,
                    strokeThickness: 3
                });
                playerText.anchor.set(0.5);
                playerText.name = 'playerText';
                playerText.y = -25;
                playerSprite.addChild(playerText);
            } else {
                playerText.text = displayName;
            }

            // Highlight self
            if (player.id === this.gameState.myId) {
                let highlight = playerSprite.getChildByName('highlight');
                if (!highlight) {
                    highlight = new PIXI.Graphics();
                    highlight.name = 'highlight';
                    highlight.lineStyle(3, 0x00FF00);
                    highlight.drawCircle(0, 0, playerSprite.width / 2);
                    playerSprite.addChildAt(highlight, 0);
                }
            } else {
                playerSprite.tint = 0xFFFFFF;
                const highlight = playerSprite.getChildByName('highlight');
                if (highlight) {
                    playerSprite.removeChild(highlight);
                }
            }
        });

        // Cleanup old sprites
        Object.keys(this.playerSprites).forEach(playerId => {
            if (!currentSprites.has(playerId)) {
                const sprite = this.playerSprites[playerId];
                this.playersContainer.removeChild(sprite);
                delete this.playerSprites[playerId];
            }
        });
    }

    drawMinimap(player) {
        // Clear minimap except background
        while (this.minimapContainer.children.length > 1) {
            this.minimapContainer.removeChildAt(1);
        }

        const minimapSize = 120;

        // Find current zone based on player position
        const currentZone = this.getCurrentZone(player);
        if (!currentZone) return;

        // Draw current zone on minimap
        const zoneRect = new PIXI.Graphics();
        zoneRect.beginFill(currentZone.color, 0.7);
        zoneRect.drawRect(0, 0, minimapSize, minimapSize);
        zoneRect.endFill();
        this.minimapContainer.addChild(zoneRect);

        // Add zone name text
        const zoneText = new PIXI.Text(currentZone.name, {
            fontFamily: 'Arial',
            fontSize: 10,
            fill: 0xFFFFFF,
            align: 'center',
            stroke: 0x000000,
            strokeThickness: 2
        });
        zoneText.anchor.set(0.5);
        zoneText.x = minimapSize / 2;
        zoneText.y = 10;
        this.minimapContainer.addChild(zoneText);

        // Calculate scaling for the current zone
        const scaleX = minimapSize / currentZone.width;
        const scaleY = minimapSize / this.gameState.worldHeight;

        // Draw portals in current zone
        this.portals.forEach(portal => {
            if (portal.zone === currentZone.name.toLowerCase().replace(' zone', '')) {
                // Calculate relative position within current zone
                const relativeX = portal.x - currentZone.x;
                const mapX = relativeX * scaleX;
                const mapY = portal.y * scaleY;

                const portalDot = new PIXI.Graphics();
                portalDot.beginFill(0xFF00FF);
                portalDot.drawCircle(mapX, mapY, 3);
                portalDot.endFill();

                // Add portal ID text
                const portalText = new PIXI.Text(portal.id, {
                    fontFamily: 'Arial',
                    fontSize: 8,
                    fill: 0xFFFFFF,
                    align: 'center',
                    stroke: 0x000000,
                    strokeThickness: 1
                });
                portalText.anchor.set(0.5);
                portalText.x = mapX;
                portalText.y = mapY - 8;

                this.minimapContainer.addChild(portalDot);
                this.minimapContainer.addChild(portalText);
            }
        });

        // Draw ALL players in current zone (including current player)
        Object.values(this.gameState.players).forEach(p => {
            if (this.isInZone(p, currentZone)) {
                // Calculate relative position within current zone
                const relativeX = p.x - currentZone.x;
                const mapX = relativeX * scaleX;
                const mapY = p.y * scaleY;

                const playerDot = new PIXI.Graphics();

                if (p.id === this.gameState.myId) {
                    // Current player - green
                    playerDot.beginFill(0x00FF00);
                    playerDot.drawCircle(mapX, mapY, 4); // Slightly larger for current player
                } else {
                    // Other players - red
                    playerDot.beginFill(0xFF0000);
                    playerDot.drawCircle(mapX, mapY, 3);
                }

                playerDot.endFill();
                this.minimapContainer.addChild(playerDot);
            }
        });
    }

    getCurrentZone(player) {
        if (!player) return null;

        for (const [key, zone] of Object.entries(this.zones)) {
            if (player.x >= zone.x && player.x <= zone.x + zone.width) {
                return zone;
            }
        }
        return this.zones.common; // Default to common zone if not found
    }

    // NEW: Helper method to check if player is in specific zone
    isInZone(player, zone) {
        return player.x >= zone.x && player.x <= zone.x + zone.width;
    }


    setupMinimap() {
        const minimapSize = 120;
        const padding = 10;

        this.minimapContainer.x = padding;
        this.minimapContainer.y = padding;

        const minimapBg = new PIXI.Graphics();
        minimapBg.beginFill(0x0A0A1A, 0.8);
        minimapBg.lineStyle(2, 0x000000);
        minimapBg.drawRect(0, 0, minimapSize, minimapSize);
        minimapBg.endFill();

        this.minimapContainer.addChild(minimapBg);
        this.app.stage.addChild(this.minimapContainer);
    }

    resizeApp() {
        this.app.renderer.resize(window.innerWidth, window.innerHeight);
    }

    setupAuthHandlers() {
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const passwordInput = document.getElementById('passwordInput');
        const enterGameBtn = document.getElementById('enterGame');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.login());
        }
        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.register());
        }
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.login();
            });
        }
        if (enterGameBtn) {
            enterGameBtn.addEventListener('click', () => this.enterGame());
        }
    }

    async login() {
        const username = document.getElementById('usernameInput').value;
        const password = document.getElementById('passwordInput').value;

        if (!username || !password) {
            this.showAuthMessage('Введите логин и пароль');
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    login: username,
                    password: password
                })
            });

            const result = await response.json();

            if (result.success) {
                this.authToken = result.user_id;
                this.username = username;

                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('username', this.username);

                this.hideAuth();
            } else {
                this.showAuthMessage('Ошибка входа: ' + result.message);
            }
        } catch (error) {
            this.showAuthMessage('Ошибка соединения: ' + error.message);
        }
    }

    async register() {
        const username = document.getElementById('usernameInput').value;
        const password = document.getElementById('passwordInput').value;

        if (!username || !password) {
            this.showAuthMessage('Введите логин и пароль');
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    login: username,
                    password: password
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showAuthMessage('Регистрация успешна! Теперь войдите.');
                document.getElementById('passwordInput').value = '';
            } else {
                this.showAuthMessage('Ошибка регистрации: ' + result.message);
            }
        } catch (error) {
            this.showAuthMessage('Ошибка соединения: ' + error.message);
        }
    }
    showAuthMessage(message) {
        document.getElementById('authMessage').textContent = message;
    }

    startGameLoop() {
        this.stopGameLoop();

        this.gameLoopInterval = setInterval(() => {
            this.gameLoop();
        }, this.frameTime);

        this.movementInterval = setInterval(() => {
            this.handleMovement();
        }, 1000/120);
    }

    stopGameLoop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
    }

    setupControls() {
        document.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', "ц", 'ф', "ы", "в"].includes(e.key)) {
                e.preventDefault();
            }
            this.keys[e.key.toLowerCase()] = true;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        window.addEventListener('blur', () => {
            this.keys = {};
        });
    }

    enterGame() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('Already connected to game server');
            return;
        }

        if (!this.authToken) {
            this.showAuth();
            return;
        }

        // Hide main menu and show game container
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';

        // Start game systems
        this.startGameLoop();
        this.setupWorldVisuals();

        const wsUrl = `ws://localhost:8080/ws?token=${this.authToken}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "error") {
                    if (data.message.includes('auth')) {
                        this.handleAuthError();
                    }
                    alert("Connection rejected: " + data.message);
                    this.ws.close();
                    return;
                }
                this.handleGameMessage(data);
            } catch (error) {
                console.error('Error parsing game message:', error);
            }
        };

        this.ws.onopen = () => {
            console.log('Connected to game server');
            // Show connection status
            const statusElement = document.querySelector('.connection-status');
            if (statusElement) {
                statusElement.textContent = 'Connected';
                statusElement.className = 'connection-status connected';
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from game server');

            // Update connection status
            const statusElement = document.querySelector('.connection-status');
            if (statusElement) {
                statusElement.textContent = 'Disconnected';
                statusElement.className = 'connection-status disconnected';
            }

            // Show main menu again on disconnect
            document.getElementById('main-menu').style.display = 'flex';
            document.getElementById('game-container').style.display = 'none';

            this.hideDebugInfo();

            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);

            // Update connection status
            const statusElement = document.querySelector('.connection-status');
            if (statusElement) {
                statusElement.textContent = 'Connection Error';
                statusElement.className = 'connection-status disconnected';
            }
        };

        this.keepAliveInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    // Update handleAuthError
    handleAuthError() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        this.authToken = null;
        this.username = null;

        // Show auth and hide everything else
        this.showAuth();
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-container').style.display = 'none';

        this.hideDebugInfo();
        this.showAuthMessage('Ошибка аутентификации. Войдите снова.');
    }

    // Update showAuth and hideAuth
    showAuth() {
        document.getElementById('authOverlay').style.display = 'flex';
        document.getElementById('main-menu').style.display = 'none';
    }

    hideAuth() {
        document.getElementById('authOverlay').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
    }

    handleGameMessage(data) {
        switch (data.type) {
            case 'state':
                this.gameState.players = data.players;
                this.gameState.myId = data.yourId;
                this.gameState.worldWidth = data.worldWidth || 7000;
                this.gameState.worldHeight = data.worldHeight || 1000;

                // Update zone display if zone information is provided
                if (data.yourZone) {
                    this.updateZoneDisplay(data.yourZone);
                }

                this.showDebugInfo();
                document.getElementById('enterGame').style.display = 'none';
                this.updateUI();
                break;
            case 'pong':
                break;
            case 'portal_teleport':
                this.handlePortalTeleport(data.data);
                // Force minimap update after teleport
                const myPlayer = this.gameState.players[this.gameState.myId];
                if (myPlayer) {
                    this.drawMinimap(myPlayer);
                }
                break;
        }
    }

// Add method to update zone display
    updateZoneDisplay(zoneKey) {
        const zoneDisplay = document.querySelector('.zone-indicator');
        if (!zoneDisplay) return;

        const zoneNames = {
            'common': 'Common Zone',
            'uncommon': 'Uncommon Zone',
            'rare': 'Rare Zone',
            'epic': 'Epic Zone',
            'legendary': 'Legendary Zone'
        };
        zoneDisplay.textContent = zoneNames[zoneKey] || 'Unknown Zone';

        // Optional: Add color coding based on zone
        const zoneColors = {
            'common': '#666666',
            'uncommon': '#00FF00',
            'rare': '#0088FF',
            'epic': '#FF00FF',
            'legendary': '#FFAA00'
        };

        zoneDisplay.style.backgroundColor = zoneColors[zoneKey] || 'rgba(0, 0, 0, 0.8)';
    }

    handlePortalTeleport(data) {
        const { fromPortal, toPortal, cooldown, toZone } = data;

        // Update zone display
        if (toZone) {
            this.updateZoneDisplay(toZone);
        }

        // Show notification to player
        this.showPortalNotification(`Teleported from ${fromPortal} to ${toPortal}! Cooldown: ${cooldown}s`);

        console.log(`Portal teleport: ${fromPortal} -> ${toPortal}, cooldown: ${cooldown}s`);
    }

// Add this method to show portal notifications
    showPortalNotification(message) {
        // Create or update notification element
        let notification = document.getElementById('portal-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'portal-notification';
            notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;
            document.body.appendChild(notification);
        }

        notification.textContent = message;
        notification.style.display = 'block';

        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    showDebugInfo() {
        document.getElementById('debug-info').style.display = 'block';
    }

    hideDebugInfo() {
        document.getElementById('debug-info').style.display = 'none';
    }

    updateUI() {
        const myPlayer = this.gameState.players[this.gameState.myId];
        if (myPlayer) {
            document.getElementById('coordinates').textContent =
                `Your coordinates: ${Math.round(myPlayer.x)}, ${Math.round(myPlayer.y)}`;
            document.getElementById('playerCount').textContent =
                Object.keys(this.gameState.players).length;

            if (this.username) {
                document.getElementById('playerId').textContent = this.username;
            }
        }
    }

    handleMovement() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.gameState.myId) return;

        let dx = 0, dy = 0;
        const speed = 5;

        if (this.keys['arrowup'] || this.keys['w'] || this.keys['ц']) dy = -speed;
        if (this.keys['arrowdown'] || this.keys['s'] || this.keys['ы']) dy = speed;
        if (this.keys['arrowleft'] || this.keys['a'] || this.keys['ф']) dx = -speed;
        if (this.keys['arrowright'] || this.keys['d'] || this.keys['в']) dx = speed;

        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }

        if (dx !== 0 || dy !== 0) {
            this.ws.send(JSON.stringify({
                type: 'move',
                data: { dx, dy }
            }));
        }
    }

    gameLoop() {
        const currentTime = Date.now();

        if (currentTime - this.lastUpdateTime < this.frameTime) {
            return;
        }

        this.lastUpdateTime = currentTime;

        this.drawWorld();
    }

    drawWorld() {
        const myPlayer = this.gameState.players[this.gameState.myId];
        if (!myPlayer) return;

        // Center camera on player
        this.camera.x = -myPlayer.x + this.app.screen.width / 2;
        this.camera.y = -myPlayer.y + this.app.screen.height / 2;

        // Update world container position
        this.worldContainer.x = this.camera.x;
        this.worldContainer.y = this.camera.y;

        // Draw world elements
        this.drawWorldSquare();
        this.drawPlayers();
        this.drawMinimap(myPlayer);
    }

    hexColor(colorString) {
        if (!colorString) return null;

        // Convert CSS color string to hex number
        if (colorString.startsWith('#')) {
            return parseInt(colorString.substring(1), 16);
        }

        // Handle named colors
        const colorMap = {
            'red': 0xFF0000,
            'green': 0x00FF00,
            'blue': 0x0000FF,
            'yellow': 0xFFFF00,
            'purple': 0xFF00FF,
            'cyan': 0x00FFFF,
            'orange': 0xFFA500
        };

        return colorMap[colorString.toLowerCase()] || 0x4CAF50;
    }

    destroy() {
        this.stopGameLoop();
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }
        if (this.ws) {
            this.ws.close();
        }
        if (this.app) {
            this.app.destroy(true);
        }
    }
}

window.addEventListener('load', async () => {
    window.gameClient = new GameClient();
    await window.gameClient.init(); // <-- await here too
});
window.addEventListener('beforeunload', () => {
    if (window.gameClient) {
        window.gameClient.destroy();
    }
});
