class GameClient {
    constructor() {
        this.app = null;
        this.ws = null;
        this.gameState = {
            players: {},
            mobs: {},
            myId: null,
            worldSize: 34000, // Updated for all zones
            worldHeight: 3000,
            petalDrops: {}
        };

        // PixiJS containers
        this.worldContainer = null;
        this.petalsContainer = null;
        this.petalDropContainer = null;
        this.playersContainer = null;
        this.playerOverlayContainer = null;
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
        this.lastFrameTime = 0;

        // Player texture
        this.playerTexture = null;
        this.deadPlayerTexture = null;
        this.playerSprites = {};

        // Portal animations
        this.portalTextures = {};
        this.portalSprites = {};
        this.portalAnimations = {};

        this.petalTextures = {}; // ← Инициализировать petalTextures
        this.petalSprites = {};
        this.petalDropSprites = {};

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

        this.mobInterpolationData = {};
        this.lastServerUpdate = 0;

        this.controlsEnabled = true; // ← ДОБАВИТЬ
        this.health = 100; // ← ДОБАВИТЬ для отслеживания здоровья
        this.maxHealth = 100;

        this.zoomLevel = 1; // <- ЕДИНСТВЕННАЯ переменная для изменения FOV

        this.diagnostics = {
            lastStateUpdate: 0,
            stateUpdateCount: 0,
            lastPlayersCount: 0,
            lastMobsCount: 0,
            renderErrors: 0,
            wsMessagesReceived: 0
        };
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

            document.getElementById('pixi-container').appendChild(this.app.canvas);

            // Load player texture
            this.playerTexture = await PIXI.Assets.load('assets/fl.png');
            this.deadPlayerTexture = await PIXI.Assets.load('assets/fl_dead.png');

            // Load portal textures
            await this.loadPortalTextures();

            // Create containers
            this.worldContainer = new PIXI.Container();
            this.mobsContainer = new PIXI.Container();
            this.playersContainer = new PIXI.Container();
            this.playerOverlayContainer = new PIXI.Container();
            this.minimapContainer = new PIXI.Container();
            this.portalsContainer = new PIXI.Container();
            this.petalsContainer = new PIXI.Container();
            this.petalDropContainer = new PIXI.Container();

            this.app.stage.addChild(this.worldContainer);
            this.app.stage.addChild(this.playerOverlayContainer)
            this.worldContainer.addChild(this.portalsContainer);
            this.worldContainer.addChild(this.playersContainer);
            this.worldContainer.addChild(this.mobsContainer);
            this.worldContainer.addChild(this.petalsContainer);
            this.worldContainer.addChild(this.petalDropContainer);


            // ADD THIS: Setup UI container
            this.setupUIContainer();

            this.drawFixedGrid();
            this.setupMinimap();
            this.createPortals();

            await this.loadMobTextures();
            await this.loadPetalTextures();

            window.addEventListener('resize', () => this.resizeApp());

            console.log('PixiJS application initialized with zones and portals');
        } catch (error) {
            console.error('Failed to initialize PixiJS:', error);
            throw error;
        }
    }

    updatePlayerOverlays() {
        const myPlayer = this.gameState.players[this.gameState.myId];
        if (!myPlayer) return;

        const visibleArea = this.getVisibleArea();
        const overlaysToKeep = new Set();

        Object.values(this.gameState.players).forEach(player => {
            if (!this.isObjectVisible(player, visibleArea)) return;

            const overlayId = `overlay_${player.id}`;
            overlaysToKeep.add(overlayId);

            let overlay = this.playerOverlays?.[overlayId];
            if (!overlay) {
                // Create name text
                const nameText = new PIXI.Text('', {
                    fontFamily: 'Arial',
                    fontSize: 16,
                    fill: 0xFFFFFF,
                    stroke: 0x000000,
                    strokeThickness: 4,
                    fontWeight: 'bold'
                });
                nameText.anchor.set(0.5);

                // Create health bar background (rounded)
                const healthBg = new PIXI.Graphics();
                // We'll draw it in update

                // Create health bar fill (rounded)
                const healthFill = new PIXI.Graphics();

                overlay = { nameText, healthBg, healthFill };
                this.playerOverlayContainer.addChild(nameText, healthBg, healthFill);
                if (!this.playerOverlays) this.playerOverlays = {};
                this.playerOverlays[overlayId] = overlay;
            }

            if (player.health <= 0) {
                overlay.nameText.visible = false;
                overlay.healthBg.visible = false;
                overlay.healthFill.visible = false;
                return; // пропускаем остальное для мёртвого игрока
            }

            // Иначе — делаем видимыми и обновляем
            overlay.nameText.visible = true;
            overlay.healthBg.visible = true;
            overlay.healthFill.visible = true;

            // Update name
            let displayName = player.username || `Player_${player.id?.substring(0,4)}`;
            if (player.id === this.gameState.myId) {
                displayName += ' (You)';
                overlay.nameText.style.fill = 0x00FF00;
            } else {
                overlay.nameText.style.fill = 0xFFFFFF;
            }
            overlay.nameText.text = displayName;

            // --- Draw rounded health bar ---
            const barWidth = 60;
            const barHeight = 8;
            const cornerRadius = 4;
            const hpPercent = Math.max(0, player.health / (player.max_health || 100));

            // Background
            overlay.healthBg.clear();
            overlay.healthBg.beginFill(0x222222) // Dark gray background
                .drawRoundedRect(-barWidth / 2, 0, barWidth, barHeight, cornerRadius)
                .endFill();

            // Border (optional, for polish)
            overlay.healthBg.lineStyle(2, 0x000000, 1)
                .drawRoundedRect(-barWidth / 2, 0, barWidth, barHeight, cornerRadius);

            // Fill
            overlay.healthFill.clear();
            const hpColor = hpPercent > 0.6 ? 0x4CAF50 : hpPercent > 0.3 ? 0xFF9800 : 0xF44336;
            const fillWidth = barWidth * hpPercent;
            if (fillWidth > 0) {
                overlay.healthFill.beginFill(hpColor)
                    .drawRoundedRect(-barWidth / 2, 0, fillWidth, barHeight, cornerRadius)
                    .endFill();
            }

            // Convert world position → screen position
            const screenPos = this.worldToScreen(player.x, player.y);
            overlay.nameText.x = screenPos.x;
            overlay.nameText.y = screenPos.y - 35; // slightly higher

            // Center health bar vertically below name
            const healthY = screenPos.y + 25;
            overlay.healthBg.x = screenPos.x;
            overlay.healthBg.y = healthY;
            overlay.healthFill.x = screenPos.x;
            overlay.healthFill.y = healthY;
        });

        // Clean up old overlays
        if (this.playerOverlays) {
            Object.keys(this.playerOverlays).forEach(id => {
                if (!overlaysToKeep.has(id)) {
                    const o = this.playerOverlays[id];
                    this.playerOverlayContainer.removeChild(o.nameText, o.healthBg, o.healthFill);
                    delete this.playerOverlays[id];
                }
            });
        }
    }

    worldToScreen(worldX, worldY) {
        // Account for camera and zoom
        const screenX = (worldX * this.zoomLevel) + this.camera.x;
        const screenY = (worldY * this.zoomLevel) + this.camera.y;
        return { x: screenX, y: screenY };
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

        Object.values(this.gameState.players).forEach(player => {
            if (!this.isObjectVisible(player, visibleArea)) return;

            const playerId = player.id;
            currentSprites.add(playerId);

            let playerSprite = this.playerSprites[playerId];
            const isDead = player.health <= 0;

            // Определяем нужную текстуру
            const targetTexture = isDead ? this.deadPlayerTexture : this.playerTexture;

            // Если спрайт не существует — создаём
            if (!playerSprite) {
                playerSprite = new PIXI.Sprite(targetTexture);
                playerSprite.anchor.set(0.5);

                const textureWidth = targetTexture.width || this.playerTexture.width; // fallback
                const desiredDiameter = this.playerRadius * 2;
                const baseScale = desiredDiameter / textureWidth;
                playerSprite.scale.set(baseScale);

                this.playerSprites[playerId] = playerSprite;
                this.playersContainer.addChild(playerSprite);

                console.log(`Created player ${playerId} (${player.username}) in current zone`);
            } else {
                // Если спрайт существует, но состояние изменилось — меняем текстуру
                if (playerSprite.texture !== targetTexture) {
                    playerSprite.texture = targetTexture;

                    // Обновляем масштаб, если размер текстуры другой
                    const textureWidth = targetTexture.width || this.playerTexture.width;
                    const desiredDiameter = this.playerRadius * 2;
                    const baseScale = desiredDiameter / textureWidth;
                    playerSprite.scale.set(baseScale);

                    console.log(`Updated texture for player ${playerId} (alive: ${!isDead})`);
                }
            }

            // Обновляем позицию
            playerSprite.x = player.x;
            playerSprite.y = player.y;

            // CRITICAL FIX: Always update player name with proper z-index
            this.updatePlayerName(player, playerSprite);

            // Обработка эффектов (можно отключить для мёртвых, если нужно)
            if (!isDead) {
                this.handleCollisionEffects(player, playerSprite);
                this.handlePlayerHighlight(player, playerSprite);
            }
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

        const displayName = player.username || player.id || "Unknown";

        if (!playerText) {
            // Create text with more visible properties
            playerText = new PIXI.Text(displayName, {
                fontFamily: 'Arial',
                fontSize: 16,
                fill: 0xFFFFFF,
                align: 'center',
                stroke: 0x000000,
                strokeThickness: 4,
                fontWeight: 'bold',
                dropShadow: true,
                dropShadowColor: 0x000000,
                dropShadowBlur: 4,
                dropShadowDistance: 0
            });
            playerText.anchor.set(0.5);
            playerText.name = 'playerText';
            playerText.y = -40; // Higher above player

            playerSprite.addChild(playerText);
            console.log(`✅ Created name label for: ${displayName}`);
        } else {
            playerText.text = displayName;
        }

        // Set color based on player type
        if (player.id === this.gameState.myId) {
            playerText.style.fill = 0x00FF00; // Green for own player
            playerText.text = `${displayName} (You)`;
        } else {
            playerText.style.fill = 0xFFFFFF; // White for other players
        }

        // Force visibility and rendering
        playerText.visible = true;
        playerText.alpha = 1;
        playerText.renderable = true;

        // CRITICAL FIX: Counteract world scaling for text
        // This ensures text stays the same size regardless of zoom
        playerText.scale.set(1 / this.zoomLevel);
    }

    setupUIContainer() {
        // Create a UI container that stays fixed relative to screen
        this.uiContainer = new PIXI.Container();
        this.app.stage.addChild(this.uiContainer);

        // Make sure UI container is on top of everything
        this.uiContainer.zIndex = 1000;
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

        // Используем requestAnimationFrame для более плавного рендеринга
        const gameLoop = (currentTime) => {
            this.gameLoopFrame = requestAnimationFrame(gameLoop);

            const deltaTime = currentTime - this.lastFrameTime;
            if (deltaTime >= this.frameTime) {
                this.gameLoop();
                this.lastFrameTime = currentTime;
            }
        };

        this.gameLoopFrame = requestAnimationFrame(gameLoop);

        // Движение обрабатываем отдельно с фиксированным интервалом
        this.movementInterval = setInterval(() => {
            this.handleMovement();
        }, 1000/120);
    }

    stopGameLoop() {
        if (this.gameLoopFrame) {
            cancelAnimationFrame(this.gameLoopFrame);
            this.gameLoopFrame = null;
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
            const loadingOverlay = document.getElementById('loadingOverlay');

            document.getElementById('game-container').style.display = 'none';

            this.hideDebugInfo();
            if (loadingOverlay) {
                loadingOverlay.classList.remove('hidden');
                loadingOverlay.style.display = 'flex';
            }

            setTimeout(() => {
                if (loadingOverlay) {
                    loadingOverlay.classList.add('hidden');
                    setTimeout(() => {
                        if (loadingOverlay.parentNode) {
                            loadingOverlay.style.display = 'none';
                        }
                        // Show main menu after loading overlay is hidden
                        document.getElementById('main-menu').style.display = 'flex';
                        document.getElementById('enterGame').style.display = 'flex';
                    }, 400);
                }
            }, 1000);

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

    debugServerData(data) {
        if (data.type === 'state' && data.players) {
            console.group('🔍 Server Player Data Debug');
            Object.entries(data.players).forEach(([playerId, player]) => {
                console.log(`Player ${playerId}:`, {
                    hasUsername: !!player.username,
                    username: player.username,
                    x: player.x,
                    y: player.y,
                    zone: player.currentZone
                });
            });
            console.groupEnd();
        }
    }

    handleGameMessage(data) {
        this.diagnostics.wsMessagesReceived++;

        switch (data.type) {
            case 'state':
                //    this.debugServerData(data);
                this.diagnostics.stateUpdateCount++;
                this.diagnostics.lastStateUpdate = Date.now();
                this.diagnostics.lastPlayersCount = Object.keys(data.players || {}).length;
                this.diagnostics.lastMobsCount = Object.keys(data.mobs || {}).length;

                // ФИКС: Проверяем и исправляем undefined зону
                if (data.yourZone === undefined || data.yourZone === null) {
                    console.warn('⚠️ Server sent undefined zone, using common as fallback');
                    data.yourZone = 'common';
                }

                // CRITICAL FIX: Ensure all player objects have username
                if (data.players) {
                    Object.keys(data.players).forEach(playerId => {
                        // If server sends player data with username, make sure it's preserved
                        if (data.players[playerId] && !data.players[playerId].username) {
                            // If this is the current player, use our stored username
                            if (playerId === data.yourId && this.username) {
                                data.players[playerId].username = this.username;
                            } else {
                                // For other players, try to get from previous state or use default
                                const previousPlayer = this.gameState.players[playerId];
                                data.players[playerId].username = previousPlayer?.username || `Player_${playerId.substring(0, 4)}`;
                            }
                        }
                    });
                }

                this.gameState.players = data.players;
                this.gameState.myId = data.yourId;
                this.gameState.mobs = data.mobs || {};
                this.gameState.petalDrops = data.petalDrops || {};
                this.gameState.worldWidth = data.worldWidth || 7000;
                this.gameState.worldHeight = data.worldHeight || 1000;

                // Логируем детали о своем игроке
                const myPlayer = this.gameState.players[this.gameState.myId];
                if (myPlayer) {
                    // ФИКС: Если у игрока нет зоны, устанавливаем её
                    if (!myPlayer.currentZone) {
                        myPlayer.currentZone = data.yourZone || 'common';
                    }
                    if (myPlayer && data.petals) {
                        myPlayer.petals = data.petals; // ← Сохраняем лепестки игрока
                    }
                } else {
                    console.warn('❌ My player not found in game state!');
                }

                this.updateMobPositionsForInterpolation();

                // ФИКС: Используем data.yourZone вместо неопределенной переменной
                if (data.yourZone) {
                    this.updateZoneDisplay(data.yourZone);
                }

                this.showDebugInfo();
                document.getElementById('enterGame').style.display = 'none';
                this.updateUI();
                break;

            case 'player_joined':
                // Handle new player joining with username
                if (data.data && data.data.player) {
                    const newPlayer = data.data.player;
                    if (newPlayer.id && newPlayer.username) {
                        this.gameState.players[newPlayer.id] = newPlayer;
                        console.log(`🆕 Player joined: ${newPlayer.username}`);
                    }
                }
                break;

            case 'player_left':
                // Handle player leaving
                if (data.data && data.data.playerId) {
                    delete this.gameState.players[data.data.playerId];
                    console.log(`🚪 Player left: ${data.data.playerId}`);
                }
                break;

            case 'collision':
                this.handleCollisionMessage(data.data);
                break;

            case 'pong':
                break;

            case 'damage_taken':
                this.handleDamageTaken(data.data);
                break;

            case 'player_died':
                this.handlePlayerDeath(data.data);
                break;

            case 'mob_killed':
                this.handleMobKilled(data.data);
                break;

            case 'player_respawned':
                this.handlePlayerRespawned(data.data);
                break;

            case 'portal_teleport':
                this.handlePortalTeleport(data.data);
                // ФИКС: Получаем текущего игрока заново
                const currentPlayer = this.gameState.players[this.gameState.myId];
                if (currentPlayer) {
                    this.drawMinimap(currentPlayer);
                }
                break;
            case 'petal_drop_created':
                this.handlePetalDropCreated(data.data);
                break;
            case 'petal_picked_up':
                this.handlePetalPickedUp(data.data);
                break;
            case 'petal_destroyed':
                this.handlePetalDestroyed(data.data);
                break;
            case 'petal_respawned':
                this.handlePetalRespawned(data.data);
                break;
            case 'petal_healed':
                this.handlePetalHealed(data.data);
                break;
            case 'mob_killed_by_petal':
                this.handleMobKilledByPetal(data.data);
                break;
        }
    }

    handlePetalDropCreated(data) {
        const { id, type, x, y } = data;

        // Показываем уведомление
        this.showPetalDropNotification(type, x, y);

        console.log(`🎯 Petal drop created: ${type} at (${x}, ${y})`);
    }

    handlePetalPickedUp(data) {
        const { type } = data;

        this.showNotification(`Picked up ${type} petal!`, 0x00FF00);

        // Виброотдача
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
    }

    handlePetalDestroyed(data) {
        const { petal_id, type } = data;

        this.showNotification(`${type} petal destroyed! Respawning in 2s...`, 0xFF0000);
    }

    handlePetalRespawned(data) {
        const { petal_id, type } = data;

        this.showNotification(`${type} petal respawned!`, 0x00FF00);
    }

    handlePetalHealed(data) {
        const { petal_id, amount, health } = data;

        // Показываем эффект исцеления
        this.showHealEffect(amount);

        console.log(`❤️ Petal healed ${amount} health. Total: ${health}`);
    }

    handleMobKilledByPetal(data) {
        const { mob_type, petal_type } = data;

        this.showNotification(`Your ${petal_type} petal killed a ${mob_type}!`, 0xFFFF00);
    }

    showPetalDropNotification(type, x, y) {
        const colors = {
            'wolf': '#FF69B4',
            'goblin': '#00FF00',
            'orc': '#FF4500'
        };

        const color = colors[type] || '#FFFFFF';

        const notification = document.createElement('div');
        notification.innerHTML = `✨ <span style="color: ${color}">${type}</span> petal dropped!`;
        notification.style.cssText = `
        position: fixed;
        top: 200px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        font-family: Arial, sans-serif;
        font-weight: bold;
    `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 3000);
    }

    showHealEffect(amount) {
        const healText = document.createElement('div');
        healText.textContent = `+${amount} ❤️`;
        healText.style.cssText = `
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #00FF00;
        font-size: 24px;
        font-weight: bold;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        z-index: 1000;
        pointer-events: none;
        animation: floatHeal 2s ease-out forwards;
    `;

        const style = document.createElement('style');
        style.textContent = `
        @keyframes floatHeal {
            0% { opacity: 1; transform: translate(-50%, -50%); }
            100% { opacity: 0; transform: translate(-50%, -100%); }
        }
    `;
        document.head.appendChild(style);

        document.body.appendChild(healText);

        setTimeout(() => {
            document.body.removeChild(healText);
            document.head.removeChild(style);
        }, 2000);
    }

    handleDamageTaken(data) {
        const { damage, health, max_health } = data;

        // Обновляем внутреннее состояние
        this.health = health;
        this.maxHealth = max_health;

        // Обновляем игрока в gameState
        const player = this.gameState.players[this.gameState.myId];
        if (player) {
            player.health = health;
            player.max_health = max_health;
        }

        this.showDamageNotification(damage);
        this.updateHealthBar(health, max_health);

        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        console.log(`💔 Damage taken: ${damage}, Health: ${health}/${max_health}`);
    }

    handlePlayerDeath(data) {
        // Блокируем управление
        this.controlsEnabled = false;

        // Показываем экран смерти
        this.showDeathScreen();

        console.log('☠️ Player died!');
    }

    handleMobKilled(data) {
        const { mob_type, rarity, xp } = data;

        // Показываем уведомление о убийстве моба
        this.showKillNotification(mob_type, rarity, xp);

        // Можно добавить систему опыта и уровней
        console.log(`🎯 Mob killed: ${mob_type} (${rarity}), XP: ${xp}`);
    }

    handlePlayerRespawned(data) {
        const { health, x, y, zone } = data;

        this.controlsEnabled = true;
        this.hideDeathScreen();

        // Обновляем внутреннее состояние
        this.health = health;
        this.maxHealth = 100;

        // Обновляем игрока в gameState
        const player = this.gameState.players[this.gameState.myId];
        if (player) {
            player.x = x;
            player.y = y;
            player.currentZone = zone;
            player.health = health; // ← ВАЖНО: обновляем здоровье игрока
        }

        this.updateHealthBar(health, 100);
        console.log(`🔁 Player respawned at (${x}, ${y}) in ${zone} zone`);
    }

    showDamageNotification(damage) {
        // Создаем летящий текст урона
        const damageText = document.createElement('div');
        damageText.textContent = `-${damage}`;
        damageText.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ff4444;
            font-size: 24px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            z-index: 1000;
            pointer-events: none;
            animation: floatUp 1s ease-out forwards;
        `;

        // Добавляем анимацию
        const style = document.createElement('style');
        style.textContent = `
            @keyframes floatUp {
                0% { opacity: 1; transform: translate(-50%, -50%); }
                100% { opacity: 0; transform: translate(-50%, -100%); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(damageText);

        // Удаляем через 1 секунду
        setTimeout(() => {
            document.body.removeChild(damageText);
            document.head.removeChild(style);
        }, 1000);
    }

    showDeathScreen() {
        let deathScreen = document.getElementById('death-screen');
        if (!deathScreen) {
            deathScreen = document.createElement('div');
            deathScreen.id = 'death-screen';
            deathScreen.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    color: white;
                    font-family: Arial, sans-serif;
                ">
                    <h1 style="color: #ff4444; font-size: 48px; margin-bottom: 20px;">☠️ YOU DIED</h1>
                    <p style="font-size: 24px; margin-bottom: 30px;">Press RESPAWN to continue</p>
                    <button id="respawn-btn" style="
                        padding: 15px 30px;
                        font-size: 20px;
                        background: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">RESPAWN</button>
                </div>
            `;
            document.body.appendChild(deathScreen);

            // Обработчик кнопки возрождения
            document.getElementById('respawn-btn').addEventListener('click', () => {
                this.sendRespawnRequest();
            });
        }

        deathScreen.style.display = 'flex';
    }

    hideDeathScreen() {
        const deathScreen = document.getElementById('death-screen');
        if (deathScreen) {
            deathScreen.style.display = 'none';
        }
    }

    sendRespawnRequest() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'respawn'
            }));
        }
    }

    showKillNotification(mobType, rarity, xp) {
        const colors = {
            common: '#ffffff',
            uncommon: '#00ff00',
            rare: '#0088ff',
            epic: '#ff00ff',
            legendary: '#ffaa00'
        };

        const color = colors[rarity] || '#ffffff';

        const killText = document.createElement('div');
        killText.innerHTML = `🎯 <span style="color: ${color}">${mobType}</span> +${xp}XP`;
        killText.style.cssText = `
            position: fixed;
            top: 20%;
            right: 20px;
            color: white;
            font-size: 16px;
            font-weight: bold;
            background: rgba(0,0,0,0.7);
            padding: 10px;
            border-radius: 5px;
            z-index: 1000;
            pointer-events: none;
            animation: slideLeft 2s ease-out forwards;
        `;

        // Анимация
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideLeft {
                0% { opacity: 1; transform: translateX(0); }
                70% { opacity: 1; transform: translateX(-10px); }
                100% { opacity: 0; transform: translateX(-100px); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(killText);

        setTimeout(() => {
            if (document.body.contains(killText)) {
                document.body.removeChild(killText);
            }
            document.head.removeChild(style);
        }, 2000);
    }

    checkPixiContainers() {
        console.group('🔍 Pixi Containers Check');
        console.log('World container children:', this.worldContainer?.children.length);
        console.log('Players container children:', this.playersContainer?.children.length);
        console.log('Mobs container children:', this.mobsContainer?.children.length);
        console.log('Portals container children:', this.portalsContainer?.children.length);
        console.log('Minimap container children:', this.minimapContainer?.children.length);
        console.groupEnd();
    }

    updateMobPositionsForInterpolation() {
        const now = Date.now();
        this.lastServerUpdate = now;
        const MOVEMENT_THRESHOLD = 0.1; // Минимальное изменение для интерполяции

        Object.values(this.gameState.mobs).forEach(mob => {
            const mobId = mob.id;

            if (!this.mobInterpolationData[mobId]) {
                this.mobInterpolationData[mobId] = {
                    startX: mob.x,
                    startY: mob.y,
                    targetX: mob.x,
                    targetY: mob.y,
                    startTime: now,
                    duration: 100,
                    lastTargetX: mob.x, // ← Добавляем отслеживание
                    lastTargetY: mob.y   // ← предыдущей цели
                };
            } else {
                const data = this.mobInterpolationData[mobId];

                // Проверяем, действительно ли моб движется
                const dx = Math.abs(mob.x - data.lastTargetX);
                const dy = Math.abs(mob.y - data.lastTargetY);
                const isMoving = (dx > MOVEMENT_THRESHOLD || dy > MOVEMENT_THRESHOLD);

                if (isMoving) {
                    // Только при реальном движении обновляем интерполяцию
                    data.startX = this.mobSprites[mobId] ? this.mobSprites[mobId].x : data.targetX;
                    data.startY = this.mobSprites[mobId] ? this.mobSprites[mobId].y : data.targetY;
                    data.targetX = mob.x;
                    data.targetY = mob.y;
                    data.startTime = now;
                }

                // Всегда обновляем последнюю известную позицию
                data.lastTargetX = mob.x;
                data.lastTargetY = mob.y;
            }
        });
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
        const { fromZone, toZone } = data; // ← именно так называются поля!

        if (toZone) {
            this.updateZoneDisplay(toZone);
        }

        // Показываем уведомление с зонами (а не порталами)
        this.showPortalNotification(`Teleported from ${fromZone || 'unknown'} to ${toZone}!`);

        console.log(`Portal teleport: ${fromZone} -> ${toZone}`);
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
        if (!this.controlsEnabled || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.gameState.myId) return;

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
        try {
            this.updateCollisionParticles();
            this.drawWorld();

            // Temporary debug
            if (Date.now() % 5000 < 16) {
                this.debugPlayerTextRendering();
            }

            if (Date.now() % 10000 < 16) {
                this.checkPixiContainers();
            }
        } catch (error) {
            console.error('❌ Error in game loop:', error);
        }
    }

    debugPlayerTextRendering() {
        console.group('🔍 Player Text Rendering Debug');
        Object.entries(this.playerSprites).forEach(([playerId, sprite]) => {
            const text = sprite.getChildByName('playerText');
            const player = this.gameState.players[playerId];
            console.log(`Player ${playerId} (${player?.username}):`, {
                hasText: !!text,
                textVisible: text?.visible,
                textAlpha: text?.alpha,
                textContent: text?.text,
                spriteVisible: sprite.visible,
                spriteAlpha: sprite.alpha
            });
        });
        console.groupEnd();
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
        this.updatePlayerOverlays()
        this.drawMobs();
        this.drawPetalDrops();
        this.drawPetals();
        this.drawMinimap(myPlayer);
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
        // Вместо создания текстур с фиксированным размером, создадим базовые текстуры
        // которые будем масштабировать в зависимости от радиуса
        const mobShapes = {
            'goblin': { color: 0x00FF00, features: 'big_ears' },
            'orc': { color: 0xFF0000, features: 'tusks' },
            'wolf': { color: 0x888888, features: 'pointed_ears' }
        };

        // Создаем базовую текстуру (радиус 20 пикселей как база)
        const baseRadius = 20;

        for (const [mobType, config] of Object.entries(mobShapes)) {
            const graphics = new PIXI.Graphics();
            graphics.beginFill(config.color);
            graphics.drawCircle(0, 0, baseRadius);
            graphics.endFill();

            // Добавляем отличительные черты
            graphics.beginFill(0x000000);
            switch (config.features) {
                case 'big_ears':
                    // Гоблин - большие уши
                    graphics.drawEllipse(-18, -12, 6, 12);
                    graphics.drawEllipse(18, -12, 6, 12);
                    break;
                case 'tusks':
                    // Орк - клыки
                    graphics.drawRect(-14, 8, 6, 10);
                    graphics.drawRect(8, 8, 6, 10);
                    break;
                case 'pointed_ears':
                    // Волк - заостренные уши
                    graphics.drawPolygon([-18, -18, -12, -6, -8, -18]);
                    graphics.drawPolygon([18, -18, 12, -6, 8, -18]);
                    break;
            }
            graphics.endFill();

            this.mobTextures[mobType] = this.app.renderer.generateTexture(graphics);
        }
    }

    drawMobs() {
        const currentMobSprites = new Set();
        const visibleArea = this.getVisibleArea();
        const now = Date.now();

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

                // Инициализируем данные интерполяции
                this.mobInterpolationData[mobId] = {
                    startX: mob.x,
                    startY: mob.y,
                    targetX: mob.x,
                    targetY: mob.y,
                    startTime: now,
                    duration: 100
                };

                console.log(`Created mob ${mobId} of type ${mob.type} with rarity ${mob.rarity}`);
            }

            // Масштабируем спрайт в соответствии с реальным радиусом моба
            const baseRadius = 20;
            const scale = (mob.radius || 20) / baseRadius;
            mobSprite.scale.set(scale);

            // Интерполяция позиции
            const data = this.mobInterpolationData[mobId];
            if (data) {
                const elapsed = now - data.startTime;
                const progress = Math.min(elapsed / data.duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 3);

                mobSprite.x = data.startX + (data.targetX - data.startX) * easeProgress;
                mobSprite.y = data.startY + (data.targetY - data.startY) * easeProgress;
            } else {
                mobSprite.x = mob.x;
                mobSprite.y = mob.y;
            }

            // Рисуем здоровье и редкость
            this.drawMobHealthBar(mob, mobSprite);
            this.drawMobRarity(mob, mobSprite); // НОВЫЙ МЕТОД ДЛЯ РЕДКОСТИ
        });

        // Очистка
        Object.keys(this.mobSprites).forEach(mobId => {
            if (!currentMobSprites.has(mobId)) {
                const sprite = this.mobSprites[mobId];
                this.mobsContainer.removeChild(sprite);
                delete this.mobSprites[mobId];
                delete this.mobInterpolationData[mobId];
                console.log(`Removed mob ${mobId} from rendering (left zone)`);
            }
        });
    }

    // НОВЫЙ МЕТОД: Отображение редкости моба
    drawMobRarity(mob, mobSprite) {
        let rarityText = mobSprite.getChildByName('rarityText');

        if (!rarityText) {
            rarityText = new PIXI.Text('', {
                fontFamily: 'Arial',
                fontSize: 10,
                fill: 0xFFFFFF,
                align: 'center',
                stroke: 0x000000,
                strokeThickness: 2
            });
            rarityText.anchor.set(0.5);
            rarityText.name = 'rarityText';
            rarityText.y = 25; // Позиция под мобом
            mobSprite.addChild(rarityText);
        }

        // Устанавливаем текст и цвет в зависимости от редкости
        const rarityConfig = this.getRarityConfig(mob.rarity);
        rarityText.text = rarityConfig.displayName;
        rarityText.style.fill = rarityConfig.color;

        // Дополнительные эффекты для легендарных мобов
        if (mob.rarity === 'legendary') {
            this.addLegendaryEffects(mobSprite);
        }
    }

    // Конфигурация редкостей
    getRarityConfig(rarity) {
        const configs = {
            'common': {
                displayName: 'Common',
                color: 0x888888
            },
            'uncommon': {
                displayName: 'Uncommon',
                color: 0x00FF00
            },
            'rare': {
                displayName: 'Rare',
                color: 0x0088FF
            },
            'epic': {
                displayName: 'Epic',
                color: 0xFF00FF
            },
            'legendary': {
                displayName: 'LEGENDARY',
                color: 0xFFAA00
            }
        };

        return configs[rarity] || configs.common;
    }

    // Эффекты для легендарных мобов
    addLegendaryEffects(mobSprite) {
        // Убираем старые эффекты
        let glowEffect = mobSprite.getChildByName('legendaryGlow');
        if (!glowEffect) {
            glowEffect = new PIXI.Graphics();
            glowEffect.name = 'legendaryGlow';
            mobSprite.addChildAt(glowEffect, 0); // Помещаем под основным спрайтом

            // Анимированное свечение
            const animateGlow = () => {
                if (!mobSprite.parent) return; // Если спрайт удален, прекращаем анимацию

                const time = Date.now() * 0.002;
                const pulse = Math.sin(time) * 0.3 + 0.7; // Пульсация от 0.4 до 1.0

                glowEffect.clear();
                glowEffect.lineStyle(4 * pulse, 0xFFAA00, 0.6);
                glowEffect.drawCircle(0, 0, 25);

                requestAnimationFrame(animateGlow);
            };

            animateGlow();
        }
    }

    createDefaultMobTexture(mobType) {
        const graphics = new PIXI.Graphics();
        const baseRadius = 20;

        // Простой круг с цветом на основе типа моба
        const color = this.getMobColor(mobType);
        graphics.beginFill(color);
        graphics.drawCircle(0, 0, baseRadius);
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
        const yOffset = -30; // Над мобом

        // Фон здоровья
        healthBackground.clear();
        healthBackground.beginFill(0x000000);
        healthBackground.drawRect(-barWidth/2, yOffset, barWidth, barHeight);
        healthBackground.endFill();

        // Полоска здоровья
        healthBar.clear();
        const healthPercent = mob.health / mob.max_health;
        let healthColor = 0x00FF00;

        if (healthPercent < 0.3) {
            healthColor = 0xFF0000;
        } else if (healthPercent < 0.6) {
            healthColor = 0xFFFF00;
        }

        healthBar.beginFill(healthColor);
        healthBar.drawRect(-barWidth/2, yOffset, barWidth * healthPercent, barHeight);
        healthBar.endFill();
    }

    updateHealthBar(health, maxHealth) {
        const healthBar = document.getElementById('health-bar');
        const healthText = document.getElementById('health-text');

        if (healthBar && healthText) {
            const percent = (health / maxHealth) * 100;
            healthBar.style.width = percent + '%';
            healthText.textContent = `${health}/${maxHealth}`;

            // Меняем цвет в зависимости от здоровья
            if (percent > 70) {
                healthBar.style.background = '#4CAF50';
            } else if (percent > 30) {
                healthBar.style.background = '#FF9800';
            } else {
                healthBar.style.background = '#F44336';
            }
        }
    }

    async loadPetalTextures() {
        try {
            console.log('🔄 Loading petal textures...');

            const petalShapes = {
                'wolf': { color: 0xFF69B4, shape: 'circle' },      // розовый
                'goblin': { color: 0x00FF00, shape: 'triangle' },  // зеленый
                'orc': { color: 0xFF4500, shape: 'square' }        // оранжево-красный
            };

            // Убедимся, что petalTextures инициализирован
            if (!this.petalTextures) {
                this.petalTextures = {};
                console.log('✅ Initialized petalTextures object');
            }

            for (const [petalType, config] of Object.entries(petalShapes)) {
                const graphics = new PIXI.Graphics();
                graphics.beginFill(config.color);

                switch (config.shape) {
                    case 'circle':
                        graphics.drawCircle(0, 0, 8);
                        break;
                    case 'triangle':
                        graphics.drawPolygon([-8, 8, 8, 8, 0, -8]);
                        break;
                    case 'square':
                        graphics.drawRect(-6, -6, 12, 12);
                        break;
                }

                graphics.endFill();

                // Генерируем текстуру
                this.petalTextures[petalType] = this.app.renderer.generateTexture(graphics);
                console.log(`✅ Loaded texture for ${petalType} petal`);
            }

            console.log('🎉 All petal textures loaded successfully');
        } catch (error) {
            console.error('❌ Error loading petal textures:', error);
            // Создаем fallback текстуры
            this.createFallbackPetalTextures();
        }
    }

    createFallbackPetalTextures() {
        console.log('🔄 Creating fallback petal textures...');

        const fallbackColors = {
            'wolf': 0xFF69B4,
            'goblin': 0x00FF00,
            'orc': 0xFF4500
        };

        for (const [petalType, color] of Object.entries(fallbackColors)) {
            const graphics = new PIXI.Graphics();
            graphics.beginFill(color);
            graphics.drawCircle(0, 0, 8);
            graphics.endFill();

            this.petalTextures[petalType] = this.app.renderer.generateTexture(graphics);
        }

        console.log('✅ Fallback petal textures created');
    }

    drawPetals() {
        const visibleArea = this.getVisibleArea();
        const currentPetals = new Set();

        // Проходим по всем игрокам в зоне
        Object.values(this.gameState.players).forEach(player => {
            if (!player.petals) return;

            Object.values(player.petals).forEach(petal => {
                // Не отображаем петал, если его здоровье <= 0
                if (petal.health <= 0) return;

                if (!this.isObjectVisible(petal, visibleArea)) return;

                const petalId = `${player.id}_${petal.id}`; // Уникальный ID: игрок_петал
                currentPetals.add(petalId);

                let petalSprite = this.petalSprites[petalId];
                if (!petalSprite) {
                    const texture = this.petalTextures[petal.type] || this.createDefaultPetalTexture(petal.type);
                    petalSprite = new PIXI.Sprite(texture);
                    petalSprite.anchor.set(0.5);

                    // Разный масштаб для разных типов петаллов
                    const scales = {
                        'wolf': 0.8,
                        'goblin': 0.7,
                        'orc': 1.0
                    };
                    petalSprite.scale.set(scales[petal.type] || 0.8);

                    this.petalsContainer.addChild(petalSprite);
                    this.petalSprites[petalId] = petalSprite;

                    console.log(`✅ Created petal ${petalId} for player ${player.username}`);
                }

                // Обновляем позицию и видимость
                petalSprite.x = petal.x;
                petalSprite.y = petal.y;
                petalSprite.visible = petal.is_active; // можно дополнительно учесть health здесь, но уже отсекли выше
            });
        });

        // Очистка удаленных петаллов
        Object.keys(this.petalSprites).forEach(petalId => {
            if (!currentPetals.has(petalId)) {
                const sprite = this.petalSprites[petalId];
                this.petalsContainer.removeChild(sprite);
                delete this.petalSprites[petalId];
                console.log(`🗑️ Removed petal ${petalId}`);
            }
        });
    }

    drawPetalDrops() {
        const currentDrops = new Set();

        // В реальности дропы должны приходить с сервера
        // Пока используем заглушку - будем получать из gameState
        if (this.gameState.petalDrops) {
            Object.values(this.gameState.petalDrops).forEach(drop => {
                const dropId = drop.id;
                currentDrops.add(dropId);

                let dropSprite = this.petalDropSprites[dropId];
                if (!dropSprite) {
                    const texture = this.petalTextures[drop.type];
                    dropSprite = new PIXI.Sprite(texture);
                    dropSprite.anchor.set(0.5);

                    // Анимация пульсации для дропов
                    this.animatePetalDrop(dropSprite);

                    this.petalDropContainer.addChild(dropSprite);
                    this.petalDropSprites[dropId] = dropSprite;
                }

                dropSprite.x = drop.x;
                dropSprite.y = drop.y;
            });
        }

        // Очистка
        Object.keys(this.petalDropSprites).forEach(dropId => {
            if (!currentDrops.has(dropId)) {
                const sprite = this.petalDropSprites[dropId];
                this.petalDropContainer.removeChild(sprite);
                delete this.petalDropSprites[dropId];
            }
        });
    }

    animatePetalDrop(sprite) {
        const startTime = Date.now();

        const animate = () => {
            if (!sprite.parent) return;

            const time = (Date.now() - startTime) * 0.001;
            const scale = 1 + Math.sin(time * 3) * 0.2; // Пульсация
            const alpha = 0.7 + Math.sin(time * 2) * 0.3; // Мерцание

            sprite.scale.set(scale);
            sprite.alpha = alpha;

            requestAnimationFrame(animate);
        };

        animate();
    }

    addPetalGlow(petal, petalSprite) {
        let glow = petalSprite.getChildByName('glow');

        if (!glow) {
            glow = new PIXI.Graphics();
            glow.name = 'glow';
            petalSprite.addChildAt(glow, 0);

            // Анимация свечения
            const animateGlow = () => {
                if (!petalSprite.parent) return;

                const time = Date.now() * 0.002;
                const pulse = Math.sin(time) * 0.3 + 0.7;

                glow.clear();

                // Разное свечение для разных типов
                let glowColor, glowSize;
                switch (petal.type) {
                    case 'wolf':
                        glowColor = 0xFF69B4;
                        glowSize = 12;
                        break;
                    case 'goblin':
                        glowColor = 0x00FF00;
                        glowSize = 10;
                        break;
                    case 'orc':
                        glowColor = 0xFF4500;
                        glowSize = 14;
                        break;
                }

                glow.lineStyle(2 * pulse, glowColor, 0.6);
                glow.drawCircle(0, 0, glowSize);

                requestAnimationFrame(animateGlow);
            };

            animateGlow();
        }
    }
}

export { GameClient };