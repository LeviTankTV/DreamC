class GameClient {
    constructor() {
        this.app = null;
        this.ws = null;
        this.gameState = {
            players: {},
            mobs: {},
            myId: null,
            worldSize: 34000, // Updated for all zones
            worldHeight: 3000
        };

        // PixiJS containers
        this.worldContainer = null;
        this.playersContainer = null;
        this.minimapContainer = null;
        this.portalsContainer = null;
        this.gridGraphics = null;
        this.worldBorder = null;
        this.mobsContainer = null;
        this.mobSprites = {};
        this.mobTextures = {};

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
            common: { x: 0, width: 6000, height: 3000, color: 0x666666, name: "Common Zone" },
            uncommon: { x: 7000, width: 6000, height: 3000, color: 0x00FF00, name: "Uncommon Zone" },
            rare: { x: 14000, width: 6000, height: 3000, color: 0x0088FF, name: "Rare Zone" },
            epic: { x: 21000, width: 6000, height: 3000, color: 0xFF00FF, name: "Epic Zone" },
            legendary: { x: 28000, width: 6000, height: 3000, color: 0xFFAA00, name: "Legendary Zone" }
        };

        // Обновляем позиции порталов
        this.portals = [
            { id: 'P1', x: 5800, y: 1500, zone: 'common' },
            { id: 'P2', x: 7200, y: 1500, zone: 'uncommon' },
            { id: 'P3', x: 12800, y: 1500, zone: 'uncommon' },
            { id: 'P4', x: 14200, y: 1500, zone: 'rare' },
            { id: 'P5', x: 19800, y: 1500, zone: 'rare' },
            { id: 'P6', x: 21200, y: 1500, zone: 'epic' },
            { id: 'P7', x: 26800, y: 1500, zone: 'epic' },
            { id: 'P8', x: 28200, y: 1500, zone: 'legendary' }
        ];

        this.collisionEffects = {};
        this.collisionParticles = [];
        this.lastCollisionTime = 0;
        this.collisionCooldown = 500;

        this.zoomLevel = 1; // <- ЕДИНСТВЕННАЯ переменная для изменения FOV
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
            this.mobsContainer = new PIXI.Container();

            this.app.stage.addChild(this.worldContainer);
            this.worldContainer.addChild(this.portalsContainer);
            this.worldContainer.addChild(this.playersContainer);
            this.worldContainer.addChild(this.mobsContainer);

            this.drawFixedGrid();
            this.setupMinimap();
            this.createPortals();

            await this.loadMobTextures();

            window.addEventListener('resize', () => this.resizeApp());

            console.log('PixiJS application initialized with zones and portals');
        } catch (error) {
            console.error('Failed to initialize PixiJS:', error);
            throw error;
        }
    }

    getVisibleArea() {
        const myPlayer = this.gameState.players[this.gameState.myId];
        if (!myPlayer) return { x: 0, y: 0, width: 0, height: 0 };

        // Вычисляем размер видимой области с учетом зума
        const viewportWidth = this.app.screen.width / this.zoomLevel;
        const viewportHeight = this.app.screen.height / this.zoomLevel;

        return {
            x: myPlayer.x - viewportWidth / 2 - 100,  // + буфер 100px
            y: myPlayer.y - viewportHeight / 2 - 100,
            width: viewportWidth + 200,               // + буфер
            height: viewportHeight + 200
        };
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

            // Draw zone borders - CHANGED TO RED AND THICKER
            this.worldBorder.lineStyle(12, 0xFF0000, 0.9); // Thicker red borders
            this.worldBorder.drawRect(zone.x, 0, zone.width, this.gameState.worldHeight);
        });

        // Draw world border - CHANGED TO RED AND THICKER
        this.worldBorder.lineStyle(12, 0xFF0000, 1); // Even thicker red border for world edges
        this.worldBorder.drawRect(0, 0, this.gameState.worldSize, this.gameState.worldHeight);

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

    isObjectVisible(object, visibleArea) {
        return object.x >= visibleArea.x &&
            object.x <= visibleArea.x + visibleArea.width &&
            object.y >= visibleArea.y &&
            object.y <= visibleArea.y + visibleArea.height;
    }

    drawPlayers() {
        const currentSprites = new Set();
        const visibleArea = this.getVisibleArea();

        // Теперь gameState.players содержит только игроков текущей зоны
        Object.values(this.gameState.players).forEach(player => {
            if (!this.isObjectVisible(player, visibleArea)) return;

            const playerId = player.id;
            currentSprites.add(playerId);

            let playerSprite = this.playerSprites[playerId];
            if (!playerSprite) {
                playerSprite = new PIXI.Sprite(this.playerTexture);
                playerSprite.anchor.set(0.5);

                const textureWidth = this.playerTexture.width;
                const desiredDiameter = this.playerRadius * 2;
                const baseScale = desiredDiameter / textureWidth;
                playerSprite.scale.set(baseScale);

                this.playerSprites[playerId] = playerSprite;
                this.playersContainer.addChild(playerSprite);

                console.log(`Created player ${playerId} in current zone`);
            }

            playerSprite.x = player.x;
            playerSprite.y = player.y;

            // Обновляем имя игрока
            this.updatePlayerName(player, playerSprite);

            // Обработка эффектов
            this.handleCollisionEffects(player, playerSprite);
            this.handlePlayerHighlight(player, playerSprite);
        });

        // Очистка спрайтов игроков, которых больше нет в зоне
        Object.keys(this.playerSprites).forEach(playerId => {
            if (!currentSprites.has(playerId)) {
                const sprite = this.playerSprites[playerId];
                this.playersContainer.removeChild(sprite);
                delete this.playerSprites[playerId];
                console.log(`Removed player ${playerId} from rendering (left zone)`);
            }
        });
    }

    updatePlayerName(player, playerSprite) {
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
    }

    // Обработка визуальных эффектов коллизий
    handleCollisionEffects(player, playerSprite) {
        // Красная обводка при коллизии
        let collisionHighlight = playerSprite.getChildByName('collisionHighlight');

        if (player.is_colliding) {
            if (!collisionHighlight) {
                collisionHighlight = new PIXI.Graphics();
                collisionHighlight.name = 'collisionHighlight';
                playerSprite.addChildAt(collisionHighlight, 0);
            }

            collisionHighlight.clear();
            collisionHighlight.lineStyle(4, 0xFF0000, 0.8);
            collisionHighlight.drawCircle(0, 0, this.playerRadius);

            // Анимация "пульсации" без изменения масштаба спрайта
            const pulseIntensity = Math.sin(Date.now() * 0.02) * 0.2 + 1; // от 0.8 до 1.2
            collisionHighlight.scale.set(pulseIntensity);

            // Создаем эффект частиц при начале коллизии
            this.createCollisionParticles(player.x, player.y);

        } else {
            // Убираем эффекты коллизии
            if (collisionHighlight) {
                collisionHighlight.clear();
                collisionHighlight.scale.set(1); // Сбрасываем масштаб
            }

            // ВАЖНО: НЕ изменяем масштаб самого спрайта игрока!
            // Базовый масштаб устанавливается только при создании
        }
    }

    // Создание эффекта частиц при коллизии
    createCollisionParticles(x, y) {
        const now = Date.now();
        if (now - this.lastCollisionTime < this.collisionCooldown) {
            return;
        }

        this.lastCollisionTime = now;

        for (let i = 0; i < 8; i++) {
            const particle = new PIXI.Graphics();
            particle.beginFill(this.getRandomColor());
            particle.drawCircle(0, 0, 3);
            particle.endFill();

            particle.x = x;
            particle.y = y;

            // Случайное направление и скорость
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.life = 30; // Время жизни в кадрах

            this.playersContainer.addChild(particle);
            this.collisionParticles.push(particle);
        }
    }

    // Обновление частиц коллизий
    updateCollisionParticles() {
        for (let i = this.collisionParticles.length - 1; i >= 0; i--) {
            const particle = this.collisionParticles[i];

            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life--;

            // Уменьшаем прозрачность
            particle.alpha = particle.life / 30;

            if (particle.life <= 0) {
                this.playersContainer.removeChild(particle);
                this.collisionParticles.splice(i, 1);
            }
        }
    }

    // Обработка подсветки игрока
    handlePlayerHighlight(player, playerSprite) {
        let highlight = playerSprite.getChildByName('highlight');

        if (player.id === this.gameState.myId) {
            if (!highlight) {
                highlight = new PIXI.Graphics();
                highlight.name = 'highlight';
                playerSprite.addChildAt(highlight, 0);
            }

            highlight.clear();

            if (player.is_colliding) {
                // Двойная обводка при коллизии своего игрока
                highlight.lineStyle(3, 0xFF0000); // Красная внутренняя
                highlight.drawCircle(0, 0, this.playerRadius);
                highlight.lineStyle(2, 0x00FF00); // Зеленая внешняя
                highlight.drawCircle(0, 0, this.playerRadius + 3);
            } else {
                // Обычная зеленая обводка
                highlight.lineStyle(3, 0x00FF00);
                highlight.drawCircle(0, 0, this.playerRadius);
            }
        } else {
            // Убираем подсветку у других игроков
            if (highlight) {
                playerSprite.removeChild(highlight);
            }
        }
    }

    // Вспомогательный метод для случайного цвета частиц
    getRandomColor() {
        const colors = [0xFF6B6B, 0x4ECDC4, 0x45B7D1, 0x96CEB4, 0xFFEAA7, 0xDDA0DD, 0x98FB98, 0xFFD700];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    drawMinimap(player) {
        // Clear minimap except background
        while (this.minimapContainer.children.length > 1) {
            this.minimapContainer.removeChildAt(1);
        }

        const minimapWidth = 240;
        const minimapHeight = 120;

        // Find current zone based on player position
        const currentZone = this.getCurrentZone(player);
        if (!currentZone) return;

        // Draw current zone on minimap
        const zoneRect = new PIXI.Graphics();
        zoneRect.beginFill(currentZone.color, 0.7);
        zoneRect.drawRect(0, 0, minimapWidth, minimapHeight);
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
        zoneText.x = minimapWidth / 2;
        zoneText.y = 10;
        this.minimapContainer.addChild(zoneText);

        // Calculate scaling for the current zone
        const scaleX = minimapWidth / currentZone.width;
        const scaleY = minimapHeight / currentZone.height;

        // Get visible area
        const visibleArea = this.getVisibleArea();

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

        // Draw ONLY VISIBLE players in current zone
        Object.values(this.gameState.players).forEach(p => {
            // Check if player is in current zone AND in visible area
            if (this.isInZone(p, currentZone) && this.isObjectVisible(p, visibleArea)) {
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

        // Draw ONLY VISIBLE mobs in current zone
        Object.values(this.gameState.mobs).forEach(mob => {
            // Check if mob is in current zone AND in visible area
            if (this.isInZone(mob, currentZone) && this.isObjectVisible(mob, visibleArea)) {
                const relativeX = mob.x - currentZone.x;
                const mapX = relativeX * scaleX;
                const mapY = mob.y * scaleY;

                const mobDot = new PIXI.Graphics();
                mobDot.beginFill(0xFFA500); // Orange for mobs
                mobDot.drawCircle(mapX, mapY, 2);
                mobDot.endFill();

                this.minimapContainer.addChild(mobDot);
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
    isInZone(entity, zone) {
        return entity.x >= zone.x &&
            entity.x <= zone.x + zone.width &&
            entity.y >= 0 &&
            entity.y <= zone.height;
    }

    setupMinimap() {
        const minimapWidth = 240;  // Увеличили в 2 раза по ширине
        const minimapHeight = 120; // Увеличили в 2 раза по высоте
        const padding = 10;

        this.minimapContainer.x = padding;
        this.minimapContainer.y = padding;

        const minimapBg = new PIXI.Graphics();
        minimapBg.beginFill(0x0A0A1A, 0.8);
        minimapBg.lineStyle(2, 0x000000);
        minimapBg.drawRect(0, 0, minimapWidth, minimapHeight);
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
                this.gameState.mobs = data.mobs || {};
                this.gameState.worldWidth = data.worldWidth || 7000;
                this.gameState.worldHeight = data.worldHeight || 1000;

                if (data.yourZone) {
                    this.updateZoneDisplay(data.yourZone);
                }

                this.showDebugInfo();
                document.getElementById('enterGame').style.display = 'none';
                this.updateUI();
                break;

            case 'collision':
                this.handleCollisionMessage(data.data);
                break;

            case 'pong':
                break;

            case 'portal_teleport':
                this.handlePortalTeleport(data.data);
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

            // Показываем количество мобов в дебаг информации
            const mobCount = Object.keys(this.gameState.mobs).length;
            let mobInfo = document.getElementById('mobInfo');
            if (!mobInfo) {
                mobInfo = document.createElement('div');
                mobInfo.id = 'mobInfo';
                document.getElementById('debug-info').appendChild(mobInfo);
            }
            mobInfo.textContent = `Mobs: ${mobCount}`;

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

        this.updateCollisionParticles();
        this.drawWorld();
    }

    handleCollisionMessage(data) {
        const { with_player, impact } = data;

        // Показываем уведомление о коллизии
        this.showCollisionNotification(`Collision with ${with_player}!`);

        // Виброотдача (если поддерживается)
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
    }

    showCollisionNotification(message) {
        let notification = document.getElementById('collision-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'collision-notification';
            notification.style.cssText = `
                position: fixed;
                top: 150px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 0, 0, 0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 1000;
                font-family: Arial, sans-serif;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
            `;
            document.body.appendChild(notification);
        }

        notification.textContent = message;
        notification.style.display = 'block';

        // Автоматическое скрытие через 2 секунды
        setTimeout(() => {
            notification.style.display = 'none';
        }, 2000);
    }


    drawWorld() {
        const myPlayer = this.gameState.players[this.gameState.myId];
        if (!myPlayer) return;

        // Apply zoom to world container
        this.worldContainer.scale.set(this.zoomLevel);

        // Get current zone
        const currentZone = this.getCurrentZone(myPlayer);

        if (currentZone) {
            // Calculate viewport dimensions in world coordinates
            const viewportWidth = this.app.screen.width / this.zoomLevel;
            const viewportHeight = this.app.screen.height / this.zoomLevel;

            // Calculate ideal camera position (centered on player)
            let desiredCameraX = -myPlayer.x * this.zoomLevel + this.app.screen.width / 2;
            let desiredCameraY = -myPlayer.y * this.zoomLevel + this.app.screen.height / 2;

            // Calculate world bounds for the current zone
            const worldMinX = -currentZone.x - currentZone.width + viewportWidth;
            const worldMaxX = -currentZone.x;
            const worldMinY = -currentZone.height + viewportHeight;
            const worldMaxY = 0;

            // Clamp camera position to zone boundaries
            let clampedCameraX = desiredCameraX;
            let clampedCameraY = desiredCameraY;

            // Horizontal clamping
            if (viewportWidth <= currentZone.width) {
                // Viewport fits within zone width - clamp to zone edges
                clampedCameraX = Math.min(Math.max(desiredCameraX, worldMinX), worldMaxX);
            } else {
                // Viewport wider than zone - center the zone
                clampedCameraX = (worldMinX + worldMaxX) / 2;
            }

            // Vertical clamping
            if (viewportHeight <= currentZone.height) {
                // Viewport fits within zone height - clamp to zone edges
                clampedCameraY = Math.min(Math.max(desiredCameraY, worldMinY), worldMaxY);
            } else {
                // Viewport taller than zone - center the zone vertically
                clampedCameraY = (worldMinY + worldMaxY) / 2;
            }

            // Apply clamped camera position
            this.camera.x = clampedCameraX;
            this.camera.y = clampedCameraY;

            // Update world container position
            this.worldContainer.x = this.camera.x;
            this.worldContainer.y = this.camera.y;

        } else {
            // Fallback to original camera behavior if no zone found
            this.camera.x = -myPlayer.x * this.zoomLevel + this.app.screen.width / 2;
            this.camera.y = -myPlayer.y * this.zoomLevel + this.app.screen.height / 2;
            this.worldContainer.x = this.camera.x;
            this.worldContainer.y = this.camera.y;
        }

        // Draw world elements
        this.drawWorldSquare();
        this.drawPlayers();
        this.drawMobs();
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

    async loadMobTextures() {
        // Простые цвета для разных типов мобов (в реальном проекте загружайте текстуры)
        const mobColors = {
            'goblin': 0x00FF00,    // Зеленый
            'orc': 0xFF0000,       // Красный
            'wolf': 0x888888,      // Серый
        };

        // Создаем простые текстуры для мобов
        for (const [mobType, color] of Object.entries(mobColors)) {
            const graphics = new PIXI.Graphics();
            graphics.beginFill(color);
            graphics.drawCircle(0, 0, 20); // Радиус 20
            graphics.endFill();

            // Добавляем отличительные черты
            graphics.beginFill(0x000000);
            if (mobType === 'goblin') {
                // Гоблин - большие уши
                graphics.drawEllipse(-15, -10, 5, 10);
                graphics.drawEllipse(15, -10, 5, 10);
            } else if (mobType === 'orc') {
                // Орк - клыки
                graphics.drawRect(-12, 5, 5, 8);
                graphics.drawRect(7, 5, 5, 8);
            } else if (mobType === 'wolf') {
                // Волк - заостренные уши
                graphics.drawPolygon([-15, -15, -10, -5, -5, -15]);
                graphics.drawPolygon([15, -15, 10, -5, 5, -15]);
            }
            graphics.endFill();

            this.mobTextures[mobType] = this.app.renderer.generateTexture(graphics);
        }
    }

    drawMobs() {
        const currentMobSprites = new Set();
        const visibleArea = this.getVisibleArea();

        // Теперь gameState.mobs содержит только мобов текущей зоны
        Object.values(this.gameState.mobs).forEach(mob => {
            if (!this.isObjectVisible(mob, visibleArea)) return;

            const mobId = mob.id;
            currentMobSprites.add(mobId);

            let mobSprite = this.mobSprites[mobId];
            if (!mobSprite) {
                const texture = this.mobTextures[mob.type] || this.createDefaultMobTexture(mob.type);
                mobSprite = new PIXI.Sprite(texture);
                mobSprite.anchor.set(0.5);

                this.mobSprites[mobId] = mobSprite;
                this.mobsContainer.addChild(mobSprite);

                console.log(`Created mob ${mobId} of type ${mob.type} in current zone`);
            }

            mobSprite.x = mob.x;
            mobSprite.y = mob.y;
            this.drawMobHealthBar(mob, mobSprite);
        });

        // Очистка спрайтов мобов, которых больше нет в зоне
        Object.keys(this.mobSprites).forEach(mobId => {
            if (!currentMobSprites.has(mobId)) {
                const sprite = this.mobSprites[mobId];
                this.mobsContainer.removeChild(sprite);
                delete this.mobSprites[mobId];
                console.log(`Removed mob ${mobId} from rendering (left zone)`);
            }
        });
    }
    createDefaultMobTexture(mobType) {
        const graphics = new PIXI.Graphics();

        // Простой круг с цветом на основе типа моба
        const color = this.getMobColor(mobType);
        graphics.beginFill(color);
        graphics.drawCircle(0, 0, 20);
        graphics.endFill();

        // Добавляем текст с типом моба
        const text = new PIXI.Text(mobType.charAt(0).toUpperCase(), {
            fontFamily: 'Arial',
            fontSize: 12,
            fill: 0xFFFFFF,
            align: 'center'
        });
        text.anchor.set(0.5);
        graphics.addChild(text);

        return this.app.renderer.generateTexture(graphics);
    }

    getMobColor(mobType) {
        const colors = {
            'goblin': 0x00FF00,
            'orc': 0xFF0000,
            'wolf': 0x888888,
            'default': 0xFFFF00
        };
        return colors[mobType] || colors.default;
    }

    drawMobHealthBar(mob, mobSprite) {
        let healthBar = mobSprite.getChildByName('healthBar');
        let healthBackground = mobSprite.getChildByName('healthBackground');

        if (!healthBackground) {
            healthBackground = new PIXI.Graphics();
            healthBackground.name = 'healthBackground';
            mobSprite.addChild(healthBackground);
        }

        if (!healthBar) {
            healthBar = new PIXI.Graphics();
            healthBar.name = 'healthBar';
            mobSprite.addChild(healthBar);
        }

        const barWidth = 40;
        const barHeight = 6;
        const yOffset = -30;

        // Фон здоровья
        healthBackground.clear();
        healthBackground.beginFill(0x000000);
        healthBackground.drawRect(-barWidth/2, yOffset, barWidth, barHeight);
        healthBackground.endFill();

        // Полоска здоровья
        healthBar.clear();
        const healthPercent = mob.health / mob.max_health;
        let healthColor = 0x00FF00; // Зеленый

        if (healthPercent < 0.3) {
            healthColor = 0xFF0000; // Красный
        } else if (healthPercent < 0.6) {
            healthColor = 0xFFFF00; // Желтый
        }

        healthBar.beginFill(healthColor);
        healthBar.drawRect(-barWidth/2, yOffset, barWidth * healthPercent, barHeight);
        healthBar.endFill();
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
