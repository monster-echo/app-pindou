import {
    _decorator,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    Label,
    Mask,
    Node,
    Sprite,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
} from 'cc';
import { AudioManager } from '../core/AudioManager';
import { ResManager } from '../core/ResManager';
import { SaveManager } from '../core/SaveManager';
import { EditorPhase, LevelData, RGB, cellColorIndex, hexToRgb } from '../core/Types';
import { THEME, applyBeadFinishRgb, getPegboardPalette } from '../ui/UIHelper';

const { ccclass } = _decorator;

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    life: number;
    maxLife: number;
    color: Color;
    kind: 'spark' | 'steam' | 'confetti' | 'ring';
    rot: number;
    vrot: number;
}

export interface BoardCallbacks {
    onProgressChanged: (filledCount: number, total: number) => void;
    onColorCompleted: (colorIndex: number, nextUnfinished: number) => void;
    onPhaseChanged: (phase: EditorPhase) => void;
    onIronProgressChanged: (percent: number) => void;
    onRevealComplete: () => void;
    onWrongCell: () => void;
}

@ccclass('BeadBoardView')
export class BeadBoardView extends Component {
    private _level!: LevelData;
    private _palette: RGB[] = [];
    private _callbacks!: BoardCallbacks;

    private _filled: Set<number> = new Set();
    private _fillTimes: Map<number, number> = new Map();
    private _heat!: Float32Array;
    private _selectedColor = 1;
    private _phase: EditorPhase = 'coloring';

    // Layout & camera transform
    private _viewW = 750;
    private _viewH = 820;
    private _baseBoardSize = 620;
    private _cellSize = 30;
    private _zoom = 1;
    private _maxZoom = 4.5;
    private _panX = 0;
    private _panY = 0;
    private _targetZoom: number | null = null;
    private _targetPanX = 0;
    private _targetPanY = 0;

    // Nodes & Graphics / Sprites
    private _boardContent!: Node;
    private _boardGfx!: Graphics;
    private _pegLayer!: Node;
    private _beadBodyLayer!: Node;
    private _beadSpecLayer!: Node;
    private _beadFusedLayer!: Node;
    private _useHdSprites = false;
    private _cellSprites: Array<{
        x: number;
        y: number;
        idx: number;
        cIdx: number;
        peg: Sprite;
        body: Sprite;
        spec: Sprite | null;
        fused: Sprite;
        num: Sprite | null;
    }> = [];
    private _useNumSprites = false;
    private _numbersLayer!: Node;
    private _labelPool: Label[] = [];
    private _paperNode!: Node;
    private _paperSprite: Sprite | null = null;
    private _paperOpacity: UIOpacity | null = null;
    private _paperGfx!: Graphics;
    private _vfxGfx!: Graphics;
    private _tweezersNode!: Node;
    private _tweezersOpacity!: UIOpacity;
    private _ironNode!: Node;
    private _ironGlowGfx!: Graphics;
    private _ironSpriteNode: Node | null = null;
    private _ironFallbackGfx: Graphics | null = null;

    // Input state
    private _isDragging = false;
    private _isPanning = false;
    private _lastTouchLocal: Vec2 | null = null;
    private _pinchStartDist = 0;
    private _pinchStartZoom = 1;
    private _wrongShakeTimer = 0;
    private _wrongCellIdx = -1;
    private _hintCellIdx = -1;
    private _hintRingTimer = 0;

    // Tweezers state
    private _tweezersTarget = new Vec2(0, 0);
    private _tweezersPos = new Vec2(0, 0);
    private _tweezersIdleTimer = 0;
    private _tweezersPinch = 0;

    // Ironing & Reveal state
    private _elapsed = 0;
    private _paperSlide = 0;
    private _paperPeel = 0;
    private _peeling = false;
    private _peelDragging = false;
    private _shineProgress = -1;
    private _ironPos = new Vec2(160, -160);
    private _ironTarget = new Vec2(160, -160);
    private _ironVelX = 0;
    private _ironPressed = false;
    private _autoIroning = false;
    private _autoIronTime = 0;
    private _ironPercent = 0;
    private _ironDoneDelay = -1;
    private _steamSpawnAccum = 0;

    // Particles
    private _particles: Particle[] = [];
    private _dirty = true;

    public get phase(): EditorPhase {
        return this._phase;
    }

    public get filled(): Set<number> {
        return this._filled;
    }

    public get selectedColor(): number {
        return this._selectedColor;
    }

    public setup(
        level: LevelData,
        initialFilled: number[],
        alreadyIroned: boolean,
        viewW: number,
        viewH: number,
        callbacks: BoardCallbacks,
    ): void {
        this._level = level;
        this._palette = level.colors.map(hexToRgb);
        this._callbacks = callbacks;
        this._viewW = viewW;
        this._viewH = viewH;

        const ui = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        ui.setContentSize(viewW, viewH);
        if (!this.node.getComponent(Mask)) {
            this.node.addComponent(Mask);
        }

        this._filled = new Set(initialFilled);
        this._fillTimes.clear();
        const gridLen = level.width * level.height;
        this._heat = new Float32Array(gridLen);
        if (alreadyIroned) {
            for (let i = 0; i < gridLen; i++) this._heat[i] = 1.0;
            this._phase = 'done';
            this._ironPercent = 100;
        } else if (this._filled.size >= level.total && level.total > 0) {
            this._phase = 'ironing';
            this._paperSlide = 0;
        } else {
            this._phase = 'coloring';
        }

        this._baseBoardSize = Math.min(viewW - 44, viewH - 44, 646);
        this._cellSize = (this._baseBoardSize * 0.88) / Math.max(level.width, level.height);
        this._maxZoom = Math.max(5.5, 72 / this._cellSize);
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._targetZoom = null;
        this._particles = [];
        this._shineProgress = -1;
        this._peeling = false;
        this._peelDragging = false;
        this._paperPeel = 0;
        this._ironPercent = 0;
        this._ironDoneDelay = -1;
        this._autoIroning = false;
        this._tweezersIdleTimer = 0;
        this._ironPos.set(160, -160);
        this._ironTarget.set(160, -160);

        this._buildNodes();
        this._bindEvents();

        this._selectedColor = this._findNextUnfinishedColor(1) || 1;
        this._updateBoardTransform();
        this._syncNumberLabels();
        this._dirty = true;
    }

    private _buildNodes(): void {
        this.node.removeAllChildren();
        this._labelPool = [];
        this._cellSprites = [];

        // 1. Zoomable / Pannable board content
        this._boardContent = new Node('BoardContent');
        this._boardContent.setParent(this.node);
        this._boardContent.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);

        const gfxNode = new Node('BoardGfx');
        gfxNode.setParent(this._boardContent);
        gfxNode.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);
        this._boardGfx = gfxNode.addComponent(Graphics);

        // Batched HD 256px Sprite layers (eliminates polygon aliasing at high zoom!)
        this._pegLayer = new Node('PegSocketLayer');
        this._pegLayer.setParent(this._boardContent);
        this._pegLayer.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);

        this._beadBodyLayer = new Node('BeadBodyLayer');
        this._beadBodyLayer.setParent(this._boardContent);
        this._beadBodyLayer.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);

        this._beadSpecLayer = new Node('BeadSpecLayer');
        this._beadSpecLayer.setParent(this._boardContent);
        this._beadSpecLayer.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);

        this._beadFusedLayer = new Node('BeadFusedLayer');
        this._beadFusedLayer.setParent(this._boardContent);
        this._beadFusedLayer.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);

        const pegSf = ResManager.ins.getBead('peg_socket_hd');
        const bodySf = ResManager.ins.getBead('bead_body_hd');
        const specSf = ResManager.ins.getBead('bead_spec_hd');
        const fusedSf = ResManager.ins.getBead('bead_fused_hd');
        this._useHdSprites = !!(pegSf && bodySf && specSf && fusedSf);

        this._numbersLayer = new Node('NumbersLayer');
        this._numbersLayer.setParent(this._boardContent);
        this._numbersLayer.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);

        const numTestSf = ResManager.ins.getNumber(1);
        const isMegaBoard = this._level.total > 1800;
        this._useNumSprites = !!(this._useHdSprites && numTestSf && !isMegaBoard);

        if (this._useHdSprites) {
            const cell = this._cellSize;
            const pegSz = cell * 1.02;
            const beadSz = cell * 1.06;
            const fusedSz = cell * 1.12;
            const numSz = cell * 0.68;
            const makeSprite = (parent: Node, sf: NonNullable<typeof pegSf>, sz: number, posX: number, posY: number): Sprite => {
                const n = new Node();
                n.setParent(parent);
                n.addComponent(UITransform).setContentSize(sz, sz);
                n.setPosition(posX, posY, 0);
                const sp = n.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = sf;
                return sp;
            };
            for (let y = 0; y < this._level.height; y++) {
                for (let x = 0; x < this._level.width; x++) {
                    const cIdx = cellColorIndex(this._level, x, y);
                    if (cIdx === 0) continue;
                    const idx = y * this._level.width + x;
                    const pos = this._cellLocalPos(x, y);
                    const rgb = this._palette[cIdx - 1];
                    const tint = new Color(rgb.r, rgb.g, rgb.b, 255);

                    const peg = makeSprite(this._pegLayer, pegSf!, pegSz, pos.x, pos.y);
                    const body = makeSprite(this._beadBodyLayer, bodySf!, beadSz, pos.x, pos.y);
                    body.color = tint;
                    let spec: Sprite | null = null;
                    if (!isMegaBoard) {
                        spec = makeSprite(this._beadSpecLayer, specSf!, beadSz, pos.x, pos.y);
                        spec.color = new Color(255, 255, 255, 220);
                    }
                    const fused = makeSprite(this._beadFusedLayer, fusedSf!, fusedSz, pos.x, pos.y);
                    fused.color = tint;

                    let num: Sprite | null = null;
                    const nSf = this._useNumSprites ? ResManager.ins.getNumber(cIdx) : null;
                    if (nSf) {
                        num = makeSprite(this._numbersLayer, nSf, numSz, pos.x, pos.y);
                        num.color = new Color(78, 54, 42, 245);
                    }

                    this._cellSprites.push({ x, y, idx, cIdx, peg, body, spec, fused, num });
                }
            }
        }

        // Fallback Label pool only used if pre-rendered number glyph textures are missing
        const initialPool = this._useNumSprites ? 0 : Math.min(260, this._level.total);
        for (let i = 0; i < initialPool; i++) {
            this._createPooledLabel();
        }

        // 2. Parchment paper overlay (Sprite + Graphics corner curl)
        this._paperNode = new Node('ParchmentLayer');
        this._paperNode.setParent(this._boardContent);
        const paperSize = this._baseBoardSize * 0.96;
        this._paperNode.addComponent(UITransform).setContentSize(paperSize, paperSize);
        const paperTex = ResManager.ins.getTexture('parchment_paper');
        this._paperSprite = null;
        this._paperOpacity = null;
        if (paperTex) {
            const texNode = new Node('PaperTex');
            texNode.setParent(this._paperNode);
            texNode.addComponent(UITransform).setContentSize(paperSize, paperSize);
            const sp = texNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = paperTex;
            this._paperSprite = sp;
            this._paperOpacity = texNode.addComponent(UIOpacity);
            this._paperOpacity.opacity = 185;
        }
        const paperGfxNode = new Node('PaperCurlGfx');
        paperGfxNode.setParent(this._paperNode);
        paperGfxNode.addComponent(UITransform).setContentSize(paperSize, paperSize);
        this._paperGfx = paperGfxNode.addComponent(Graphics);

        // 3. VFX layer (sparks, steam, confetti, placement rings)
        const vfxNode = new Node('VfxGfx');
        vfxNode.setParent(this._boardContent);
        vfxNode.addComponent(UITransform).setContentSize(this._baseBoardSize, this._baseBoardSize);
        this._vfxGfx = vfxNode.addComponent(Graphics);

        // 4. Precision Craft Tweezers sprite (coloring cursor)
        this._tweezersNode = new Node('Tweezers');
        this._tweezersNode.setParent(this._boardContent);
        const twUi = this._tweezersNode.addComponent(UITransform);
        twUi.setContentSize(142, 152);
        twUi.setAnchorPoint(0.05, 0.05); // Tip at bottom-left
        this._tweezersOpacity = this._tweezersNode.addComponent(UIOpacity);
        this._tweezersOpacity.opacity = 0;
        const twSf = ResManager.ins.getTexture('tweezers_sprite');
        if (twSf) {
            const sp = this._tweezersNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = twSf;
        }

        // 5. Illustrated 3D Mini Craft Iron (ironing tool)
        this._ironNode = new Node('IronTool');
        this._ironNode.setParent(this._boardContent);
        this._ironNode.addComponent(UITransform).setContentSize(220, 220);

        const glowNode = new Node('IronGlow');
        glowNode.setParent(this._ironNode);
        glowNode.addComponent(UITransform).setContentSize(220, 220);
        this._ironGlowGfx = glowNode.addComponent(Graphics);

        const ironSf = ResManager.ins.getTexture('iron_sprite');
        this._ironSpriteNode = null;
        this._ironFallbackGfx = null;
        if (ironSf) {
            const spNode = new Node('IronSprite');
            spNode.setParent(this._ironNode);
            spNode.addComponent(UITransform).setContentSize(184, 184);
            spNode.setPosition(14, 24, 0); // Soleplate center aligns with ironPos
            const sp = spNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = ironSf;
            this._ironSpriteNode = spNode;
        } else {
            const fbNode = new Node('IronFallback');
            fbNode.setParent(this._ironNode);
            fbNode.addComponent(UITransform).setContentSize(160, 160);
            this._ironFallbackGfx = fbNode.addComponent(Graphics);
        }
        this._ironNode.active = false;
    }

    private _bindEvents(): void {
        this.node.targetOff(this);
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
        this.node.on(Node.EventType.MOUSE_WHEEL, this._onMouseWheel, this);
    }

    protected onDisable(): void {
        AudioManager.ins.setSteam(false);
    }

    protected onDestroy(): void {
        AudioManager.ins.setSteam(false);
        this.node.targetOff(this);
    }

    public setSelectedColor(colorIndex: number): void {
        if (this._selectedColor === colorIndex) return;
        this._selectedColor = colorIndex;
        this._dirty = true;
    }

    public resetView(): void {
        this._targetZoom = 1;
        this._targetPanX = 0;
        this._targetPanY = 0;
    }

    public restartLevel(): void {
        this._filled.clear();
        this._fillTimes.clear();
        this._heat.fill(0);
        this._phase = 'coloring';
        this._paperSlide = 0;
        this._paperPeel = 0;
        this._peeling = false;
        this._peelDragging = false;
        this._shineProgress = -1;
        this._ironPercent = 0;
        this._ironDoneDelay = -1;
        this._autoIroning = false;
        this._tweezersIdleTimer = 0;
        AudioManager.ins.setSteam(false);
        this._selectedColor = 1;
        this.resetView();
        this._syncNumberLabels();
        this._callbacks.onPhaseChanged('coloring');
        this._callbacks.onProgressChanged(0, this._level.total);
        this._dirty = true;
    }

    /** Hint booster: focus camera on an unfilled cell of current color and fill it with pulse ring */
    public useHint(): boolean {
        if (this._phase !== 'coloring') return false;
        const targetColor = this._selectedColor;
        let foundX = -1;
        let foundY = -1;
        for (let y = 0; y < this._level.height && foundX < 0; y++) {
            for (let x = 0; x < this._level.width; x++) {
                const idx = y * this._level.width + x;
                if (cellColorIndex(this._level, x, y) === targetColor && !this._filled.has(idx)) {
                    foundX = x;
                    foundY = y;
                    break;
                }
            }
        }
        if (foundX < 0) {
            const next = this._findNextUnfinishedColor(1);
            if (next === 0) return false;
            this._selectedColor = next;
            return this.useHint();
        }
        const idx = foundY * this._level.width + foundX;
        const pos = this._cellLocalPos(foundX, foundY);
        this._targetZoom = Math.min(this._maxZoom, Math.max(this._zoom, 34 / this._cellSize));
        this._targetPanX = -pos.x * this._targetZoom;
        this._targetPanY = -pos.y * this._targetZoom;
        this._clampTargetPan();
        this._hintCellIdx = idx;
        this._hintRingTimer = 1.1;
        this._tweezersTarget.set(pos.x, pos.y);
        this._tweezersPos.set(pos.x, pos.y);
        this._tweezersIdleTimer = 0.7;
        this._fillCell(foundX, foundY, true);
        return true;
    }

    /** Bucket booster: flood-fill a contiguous cluster of the selected color (up to 18 beads) */
    public useBucket(): boolean {
        if (this._phase !== 'coloring') return false;
        const color = this._selectedColor;
        let seedX = -1;
        let seedY = -1;
        for (let y = 0; y < this._level.height && seedX < 0; y++) {
            for (let x = 0; x < this._level.width; x++) {
                const idx = y * this._level.width + x;
                if (cellColorIndex(this._level, x, y) === color && !this._filled.has(idx)) {
                    seedX = x;
                    seedY = y;
                    break;
                }
            }
        }
        if (seedX < 0) return false;

        const queue: Array<[number, number]> = [[seedX, seedY]];
        const visited = new Set<number>([seedY * this._level.width + seedX]);
        const cluster: Array<[number, number]> = [];
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const maxCluster = Math.max(18, Math.min(120, Math.round(this._level.total * 0.025)));
        while (queue.length > 0 && cluster.length < maxCluster) {
            const [cx, cy] = queue.shift()!;
            cluster.push([cx, cy]);
            for (const [dx, dy] of dirs) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || nx >= this._level.width || ny < 0 || ny >= this._level.height) continue;
                const nIdx = ny * this._level.width + nx;
                if (visited.has(nIdx) || this._filled.has(nIdx)) continue;
                if (cellColorIndex(this._level, nx, ny) === color) {
                    visited.add(nIdx);
                    queue.push([nx, ny]);
                }
            }
        }

        cluster.forEach(([x, y], i) => {
            const idx = y * this._level.width + x;
            this._filled.add(idx);
            this._fillTimes.set(idx, this._elapsed + i * 0.022);
            const pos = this._cellLocalPos(x, y);
            const rgb = this._palette[color - 1];
            this._spawnBeadSparks(pos.x, pos.y, new Color(rgb.r, rgb.g, rgb.b, 255), 3);
        });
        AudioManager.ins.playColorDone();
        this._syncNumberLabels();
        this._afterCellsAdded(color);
        this._dirty = true;
        return true;
    }

    /** Magic booster: auto-place up to `maxCount` beads of the active color cleanly */
    public useMagicFill(maxCount = 25): number {
        if (this._phase !== 'coloring') return 0;
        let color = this._selectedColor;
        const collectTargets = (c: number): Array<[number, number]> => {
            const pts: Array<[number, number]> = [];
            for (let y = 0; y < this._level.height; y++) {
                for (let x = 0; x < this._level.width; x++) {
                    const idx = y * this._level.width + x;
                    if (cellColorIndex(this._level, x, y) === c && !this._filled.has(idx)) {
                        pts.push([x, y]);
                    }
                }
            }
            return pts;
        };

        let targets = collectTargets(color);
        if (targets.length === 0) {
            const next = this._findNextUnfinishedColor(1);
            if (next === 0) return 0;
            color = next;
            this._selectedColor = next;
            targets = collectTargets(color);
        }
        const batch = targets.slice(0, maxCount);
        if (batch.length === 0) return 0;

        batch.forEach(([x, y], i) => {
            const idx = y * this._level.width + x;
            this._filled.add(idx);
            this._fillTimes.set(idx, this._elapsed + i * 0.016);
            const pos = this._cellLocalPos(x, y);
            const rgb = this._palette[color - 1];
            this._spawnBeadSparks(pos.x, pos.y, new Color(rgb.r, rgb.g, rgb.b, 255), 3);
        });
        AudioManager.ins.playColorDone();
        this._syncNumberLabels();
        this._afterCellsAdded(color);
        this._dirty = true;
        return batch.length;
    }

    public triggerAutoIron(): void {
        if (this._phase !== 'ironing') return;
        this._autoIroning = true;
        this._autoIronTime = 0;
        this._ironPressed = true;
    }

    public triggerPeel(): void {
        if (this._phase !== 'reveal' || this._peeling) return;
        this._peeling = true;
        AudioManager.ins.playPeelPaper();
    }

    private _cellLocalPos(x: number, y: number): Vec2 {
        const lx = (x - this._level.width / 2 + 0.5) * this._cellSize;
        const ly = (this._level.height / 2 - y - 0.5) * this._cellSize;
        return new Vec2(lx, ly);
    }

    private _screenToBoardLocal(uiPos: Vec2): Vec2 {
        const ui = this.node.getComponent(UITransform)!;
        const localInView = ui.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
        const bx = (localInView.x - this._panX) / this._zoom;
        const by = (localInView.y - this._panY) / this._zoom;
        return new Vec2(bx, by);
    }

    private _boardLocalToGrid(local: Vec2): { x: number; y: number } {
        const gx = Math.floor(local.x / this._cellSize + this._level.width / 2);
        const gy = Math.floor(this._level.height / 2 - local.y / this._cellSize);
        return { x: gx, y: gy };
    }

    private _onMouseWheel(e: EventMouse): void {
        if (this._phase !== 'coloring') return;
        const delta = e.getScrollY() > 0 ? 1.15 : 0.87;
        this._targetZoom = null;
        this._zoom = Math.max(1.0, Math.min(this._maxZoom, this._zoom * delta));
        this._clampPan();
        this._updateBoardTransform();
    }

    private _onTouchStart(e: EventTouch): void {
        const touches = e.getTouches();
        if (this._phase === 'reveal') {
            this._peelDragging = true;
            return;
        }
        if (this._phase === 'done') return;

        if (this._phase === 'ironing') {
            this._autoIroning = false;
            this._ironPressed = true;
            const local = this._screenToBoardLocal(e.getUILocation());
            this._ironTarget.set(local.x, local.y);
            this._ironPos.set(local.x, local.y);
            this._applyIronHeat(local.x, local.y, 0.045);
            if (this._phase === 'ironing') {
                AudioManager.ins.setSteam(true, 0.55);
            }
            return;
        }

        this._targetZoom = null;
        if (touches.length >= 2) {
            this._isPanning = true;
            this._isDragging = false;
            const p0 = touches[0].getUILocation();
            const p1 = touches[1].getUILocation();
            this._pinchStartDist = Vec2.distance(p0, p1);
            this._pinchStartZoom = this._zoom;
            return;
        }

        this._isDragging = true;
        this._isPanning = false;
        const local = this._screenToBoardLocal(e.getUILocation());
        this._tweezersTarget.set(local.x, local.y);
        this._tweezersPos.set(local.x, local.y);
        this._tweezersIdleTimer = 0.6;
        this._lastTouchLocal = local;
        this._paintAtBoardLocal(local, true);
    }

    private _onTouchMove(e: EventTouch): void {
        const touches = e.getTouches();
        if (this._phase === 'reveal') {
            if (!this._peelDragging || this._peeling) return;
            const delta = e.getUIDelta();
            const pull = Math.max(0, (-delta.x + delta.y) * 0.0045);
            if (pull > 0) {
                if (this._paperPeel === 0) AudioManager.ins.playPeelPaper();
                this._paperPeel = Math.min(1, this._paperPeel + pull);
                if (this._paperPeel >= 0.42) {
                    this.triggerPeel();
                }
            }
            return;
        }
        if (this._phase === 'ironing') {
            if (!this._ironPressed) return;
            const local = this._screenToBoardLocal(e.getUILocation());
            const dx = local.x - this._ironTarget.x;
            const dy = local.y - this._ironTarget.y;
            const speed = Math.hypot(dx, dy);
            this._ironVelX = this._ironVelX * 0.7 + dx * 0.3;
            this._ironTarget.set(local.x, local.y);
            const steps = Math.max(1, Math.ceil(speed / 16));
            for (let i = 1; i <= steps; i++) {
                if (this._phase !== 'ironing') break;
                const t = i / steps;
                const ix = this._ironPos.x + (local.x - this._ironPos.x) * t;
                const iy = this._ironPos.y + (local.y - this._ironPos.y) * t;
                this._applyIronHeat(ix, iy, 0.035);
            }
            if (this._phase === 'ironing' && this._ironPressed) {
                AudioManager.ins.setSteam(true, Math.min(0.85, 0.38 + speed * 0.015));
            } else {
                AudioManager.ins.setSteam(false);
            }
            return;
        }

        if (this._phase !== 'coloring') return;

        if (touches.length >= 2) {
            this._isPanning = true;
            this._isDragging = false;
            const p0 = touches[0].getUILocation();
            const p1 = touches[1].getUILocation();
            const dist = Vec2.distance(p0, p1);
            if (this._pinchStartDist > 10) {
                this._zoom = Math.max(1.0, Math.min(this._maxZoom, this._pinchStartZoom * (dist / this._pinchStartDist)));
            }
            const d0 = touches[0].getUIDelta();
            const d1 = touches[1].getUIDelta();
            this._panX += (d0.x + d1.x) * 0.5;
            this._panY += (d0.y + d1.y) * 0.5;
            this._clampPan();
            this._updateBoardTransform();
            return;
        }

        if (!this._isDragging) return;
        const local = this._screenToBoardLocal(e.getUILocation());
        this._tweezersTarget.set(local.x, local.y);
        this._tweezersIdleTimer = 0.6;
        const prev = this._lastTouchLocal ?? local;
        const dist = Vec2.distance(prev, local);
        const steps = Math.max(1, Math.ceil(dist / (this._cellSize * 0.32)));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = new Vec2(prev.x + (local.x - prev.x) * t, prev.y + (local.y - prev.y) * t);
            this._paintAtBoardLocal(p, false);
        }
        this._lastTouchLocal = local;
    }

    private _onTouchEnd(): void {
        this._isDragging = false;
        this._isPanning = false;
        this._lastTouchLocal = null;
        if (this._phase === 'reveal' && this._peelDragging && !this._peeling) {
            this._peelDragging = false;
            // Tapping also smoothly peels off the parchment!
            this.triggerPeel();
        }
        if (this._phase === 'ironing' && !this._autoIroning) {
            this._ironPressed = false;
            AudioManager.ins.setSteam(false);
        }
    }

    private _paintAtBoardLocal(local: Vec2, allowWrongFeedback: boolean): void {
        const { x, y } = this._boardLocalToGrid(local);
        if (x < 0 || x >= this._level.width || y < 0 || y >= this._level.height) return;
        const cIdx = cellColorIndex(this._level, x, y);
        if (cIdx === 0) return;
        const idx = y * this._level.width + x;
        if (this._filled.has(idx)) return;

        if (cIdx === this._selectedColor) {
            this._fillCell(x, y, true);
        } else if (allowWrongFeedback) {
            this._wrongCellIdx = idx;
            this._wrongShakeTimer = 0.22;
            AudioManager.ins.playError();
            this._callbacks.onWrongCell();
            this._dirty = true;
        }
    }

    private _fillCell(x: number, y: number, playAudio: boolean): void {
        const idx = y * this._level.width + x;
        if (this._filled.has(idx)) return;
        const color = cellColorIndex(this._level, x, y);
        this._filled.add(idx);
        this._fillTimes.set(idx, this._elapsed);
        this._tweezersPinch = 1.0;
        this._syncNumberLabels();

        if (playAudio) AudioManager.ins.playBeadPop();
        const pos = this._cellLocalPos(x, y);
        const rgb = this._palette[color - 1];
        const beadColor = new Color(rgb.r, rgb.g, rgb.b, 255);
        this._spawnBeadSparks(pos.x, pos.y, beadColor, 4);
        this._spawnPlacementRing(pos.x, pos.y, beadColor);

        this._afterCellsAdded(color);
        this._dirty = true;
    }

    private _afterCellsAdded(color: number): void {
        this._callbacks.onProgressChanged(this._filled.size, this._level.total);

        if (!this._colorHasUnfilled(color)) {
            AudioManager.ins.playColorDone();
            const next = this._findNextUnfinishedColor(color);
            if (next > 0) {
                this._selectedColor = next;
            }
            this._callbacks.onColorCompleted(color, next);
        }

        if (this._filled.size >= this._level.total && this._level.total > 0) {
            this._enterIroningPhase();
        }
    }

    private _enterIroningPhase(): void {
        this._phase = 'ironing';
        this._paperSlide = 0;
        this._ironPercent = 0;
        this._ironDoneDelay = -1;
        this._tweezersIdleTimer = 0;
        this._targetZoom = 1;
        this._targetPanX = 0;
        this._targetPanY = 0;
        this._ironPos.set(170, -170);
        this._ironTarget.set(170, -170);
        this._syncNumberLabels();
        this._callbacks.onPhaseChanged('ironing');
        this._callbacks.onIronProgressChanged(0);
        this._dirty = true;
    }

    private _applyIronHeat(bx: number, by: number, dtPower: number): void {
        if (this._ironDoneDelay >= 0) return;
        // Match physical soleplate radius (~58px) and NEVER heat beads outside the iron's actual reach
        const ironRadius = Math.max(58, this._cellSize * 2.4);
        const r2 = ironRadius * ironRadius;
        let heatedNew = false;

        for (let y = 0; y < this._level.height; y++) {
            for (let x = 0; x < this._level.width; x++) {
                const cIdx = cellColorIndex(this._level, x, y);
                if (cIdx === 0) continue;
                const idx = y * this._level.width + x;
                if (this._heat[idx] >= 1.0) continue;
                const pos = this._cellLocalPos(x, y);
                const dx = pos.x - bx;
                const dy = pos.y - by;
                const d2 = dx * dx + dy * dy;
                if (d2 < r2) {
                    const falloff = 1.0 - Math.sqrt(d2) / ironRadius;
                    const inc = dtPower * (0.7 + 1.7 * falloff) * 4.2;
                    this._heat[idx] = Math.min(1.0, this._heat[idx] + inc);
                    heatedNew = true;
                }
            }
        }

        if (heatedNew) {
            this._recomputeIronProgress();
            this._dirty = true;
        }
    }

    private _recomputeIronProgress(): void {
        let sum = 0;
        let count = 0;
        let unmelted = 0;
        for (let y = 0; y < this._level.height; y++) {
            for (let x = 0; x < this._level.width; x++) {
                if (cellColorIndex(this._level, x, y) === 0) continue;
                count++;
                const h = this._heat[y * this._level.width + x];
                sum += h;
                if (h < 0.98) unmelted++;
            }
        }
        const ratio = count > 0 ? sum / count : 1;
        // Only reach 100% once EVERY bead has actually been ironed (>= 0.98 heat)
        const pct = unmelted === 0 ? 100 : Math.min(99, Math.floor(ratio * 100));
        if (pct !== this._ironPercent) {
            this._ironPercent = pct;
            this._callbacks.onIronProgressChanged(pct);
        }

        if (unmelted === 0 && this._phase === 'ironing' && this._ironDoneDelay < 0) {
            for (let i = 0; i < this._heat.length; i++) this._heat[i] = 1.0;
            this._ironPercent = 100;
            this._ironPressed = false;
            this._autoIroning = false;
            AudioManager.ins.setSteam(false);
            this._callbacks.onIronProgressChanged(100);
            // Hold visible 100% bar briefly before opening the parchment peel stage
            this._ironDoneDelay = 0.32;
            this._dirty = true;
        }
    }

    private _colorHasUnfilled(color: number): boolean {
        for (let y = 0; y < this._level.height; y++) {
            for (let x = 0; x < this._level.width; x++) {
                if (cellColorIndex(this._level, x, y) === color && !this._filled.has(y * this._level.width + x)) {
                    return true;
                }
            }
        }
        return false;
    }

    private _findNextUnfinishedColor(after: number): number {
        const count = this._level.colors.length;
        for (let i = 0; i < count; i++) {
            const c = ((after - 1 + i) % count) + 1;
            if (this._colorHasUnfilled(c)) return c;
        }
        return 0;
    }

    private _createPooledLabel(): Label {
        const ln = new Node(`PL_${this._labelPool.length}`);
        ln.setParent(this._numbersLayer);
        ln.addComponent(UITransform).setContentSize(56, 56);
        const lbl = ln.addComponent(Label);
        lbl.fontSize = 48;
        lbl.lineHeight = 52;
        lbl.isBold = true;
        lbl.color = new Color(86, 60, 46, 245);
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        ln.active = false;
        this._labelPool.push(lbl);
        return lbl;
    }

    private _syncNumberLabels(): void {
        if (!this._level || !this._numbersLayer) return;
        const effectiveCell = this._cellSize * this._zoom;
        const showNums = this._phase === 'coloring' && effectiveCell >= 12.5;

        if (this._useNumSprites) {
            this._numbersLayer.active = showNums;
            return;
        }

        if (!showNums) {
            for (const lbl of this._labelPool) lbl.node.active = false;
            return;
        }

        // Compute visible grid bounds in BoardContent local coordinates
        const halfW = (this._viewW * 0.5) / this._zoom;
        const halfH = (this._viewH * 0.5) / this._zoom;
        const cx = -this._panX / this._zoom;
        const cy = -this._panY / this._zoom;

        const minX = Math.max(0, Math.floor((cx - halfW) / this._cellSize + this._level.width / 2) - 1);
        const maxX = Math.min(this._level.width - 1, Math.ceil((cx + halfW) / this._cellSize + this._level.width / 2) + 1);
        const minY = Math.max(0, Math.floor(this._level.height / 2 - (cy + halfH) / this._cellSize) - 1);
        const maxY = Math.min(this._level.height - 1, Math.ceil(this._level.height / 2 - (cy - halfH) / this._cellSize) + 1);

        const labelScale = (this._cellSize * 0.52) / 48;
        const boardPal = getPegboardPalette(SaveManager.ins.activePegboard);
        const labelColor = boardPal.isDark
            ? new Color(242, 240, 255, 245)
            : new Color(78, 54, 42, 245);
        let used = 0;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const cIdx = cellColorIndex(this._level, x, y);
                if (cIdx === 0) continue;
                const idx = y * this._level.width + x;
                if (this._filled.has(idx)) continue;
                if (used >= 1400) break;

                const lbl = used < this._labelPool.length ? this._labelPool[used] : this._createPooledLabel();
                used++;
                const pos = this._cellLocalPos(x, y);
                lbl.node.active = true;
                lbl.node.setPosition(pos.x, pos.y, 0);
                lbl.node.setScale(labelScale, labelScale, 1);
                lbl.color = labelColor;
                if (lbl.string !== `${cIdx}`) lbl.string = `${cIdx}`;
            }
            if (used >= 1400) break;
        }

        for (let i = used; i < this._labelPool.length; i++) {
            if (this._labelPool[i].node.active) this._labelPool[i].node.active = false;
        }
    }

    private _clampPan(): void {
        const maxPanX = Math.max(0, (this._baseBoardSize * this._zoom - this._viewW * 0.72) * 0.55);
        const maxPanY = Math.max(0, (this._baseBoardSize * this._zoom - this._viewH * 0.72) * 0.55);
        this._panX = Math.max(-maxPanX, Math.min(maxPanX, this._panX));
        this._panY = Math.max(-maxPanY, Math.min(maxPanY, this._panY));
    }

    private _clampTargetPan(): void {
        if (this._targetZoom === null) return;
        const maxPanX = Math.max(0, (this._baseBoardSize * this._targetZoom - this._viewW * 0.72) * 0.55);
        const maxPanY = Math.max(0, (this._baseBoardSize * this._targetZoom - this._viewH * 0.72) * 0.55);
        this._targetPanX = Math.max(-maxPanX, Math.min(maxPanX, this._targetPanX));
        this._targetPanY = Math.max(-maxPanY, Math.min(maxPanY, this._targetPanY));
    }

    private _updateBoardTransform(): void {
        if (!this._boardContent) return;
        this._boardContent.setScale(this._zoom, this._zoom, 1);
        this._boardContent.setPosition(this._panX, this._panY, 0);
        this._syncNumberLabels();
    }

    private _spawnBeadSparks(x: number, y: number, color: Color, count: number): void {
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.8;
            const spd = 48 + Math.random() * 78;
            this._particles.push({
                x,
                y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd + 22,
                r: 3.5 + Math.random() * 3,
                life: 0,
                maxLife: 0.34 + Math.random() * 0.16,
                color: color.clone(),
                kind: 'spark',
                rot: 0,
                vrot: 0,
            });
        }
    }

    private _spawnPlacementRing(x: number, y: number, color: Color): void {
        this._particles.push({
            x,
            y,
            vx: 0,
            vy: 0,
            r: this._cellSize * 0.4,
            life: 0,
            maxLife: 0.28,
            color: new Color(color.r, color.g, color.b, 185),
            kind: 'ring',
            rot: 0,
            vrot: 0,
        });
    }

    private _spawnSteamPuff(x: number, y: number): void {
        const ang = Math.random() * Math.PI * 2;
        const dist = 26 + Math.random() * 36;
        this._particles.push({
            x: x + Math.cos(ang) * dist,
            y: y + Math.sin(ang) * dist * 0.65,
            vx: (Math.random() - 0.5) * 34,
            vy: 48 + Math.random() * 44,
            r: 14 + Math.random() * 16,
            life: 0,
            maxLife: 0.72 + Math.random() * 0.35,
            color: new Color(255, 255, 255, 165),
            kind: 'steam',
            rot: 0,
            vrot: 0,
        });
    }

    private _spawnConfetti(): void {
        const colors = [
            new Color(255, 107, 139, 255),
            new Color(255, 209, 102, 255),
            new Color(45, 196, 182, 255),
            new Color(129, 140, 248, 255),
            new Color(255, 159, 67, 255),
        ];
        for (let i = 0; i < 56; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 130 + Math.random() * 270;
            this._particles.push({
                x: (Math.random() - 0.5) * 140,
                y: (Math.random() - 0.5) * 140,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd + 140,
                r: 7 + Math.random() * 5,
                life: 0,
                maxLife: 1.15 + Math.random() * 0.6,
                color: colors[i % colors.length].clone(),
                kind: 'confetti',
                rot: Math.random() * Math.PI,
                vrot: (Math.random() - 0.5) * 10,
            });
        }
    }

    protected update(dt: number): void {
        if (!this._level) return;
        const cdt = Math.min(dt, 0.05);
        this._elapsed += cdt;

        let needRedrawBoard = this._dirty;

        if (this._targetZoom !== null) {
            const k = Math.min(1, cdt * 10);
            this._zoom += (this._targetZoom - this._zoom) * k;
            this._panX += (this._targetPanX - this._panX) * k;
            this._panY += (this._targetPanY - this._panY) * k;
            if (
                Math.abs(this._targetZoom - this._zoom) < 0.005 &&
                Math.abs(this._targetPanX - this._panX) < 0.5 &&
                Math.abs(this._targetPanY - this._panY) < 0.5
            ) {
                this._zoom = this._targetZoom;
                this._panX = this._targetPanX;
                this._panY = this._targetPanY;
                this._targetZoom = null;
            }
            this._updateBoardTransform();
        }

        if (this._fillTimes.size > 0) {
            this._fillTimes.forEach((t, idx) => {
                if (this._elapsed - t > 0.3) {
                    this._fillTimes.delete(idx);
                } else {
                    needRedrawBoard = true;
                }
            });
        }

        if (this._wrongShakeTimer > 0) {
            this._wrongShakeTimer = Math.max(0, this._wrongShakeTimer - cdt);
            needRedrawBoard = true;
        }

        if (this._hintRingTimer > 0) {
            this._hintRingTimer = Math.max(0, this._hintRingTimer - cdt);
        }

        // Update tweezers sprite
        if (this._phase === 'coloring' && (this._isDragging || this._tweezersIdleTimer > 0)) {
            if (!this._isDragging) this._tweezersIdleTimer = Math.max(0, this._tweezersIdleTimer - cdt);
            this._tweezersPos.x += (this._tweezersTarget.x - this._tweezersPos.x) * Math.min(1, cdt * 24);
            this._tweezersPos.y += (this._tweezersTarget.y - this._tweezersPos.y) * Math.min(1, cdt * 24);
            this._tweezersPinch = Math.max(0, this._tweezersPinch - cdt * 6);
            const dip = this._tweezersPinch * 6;
            const sc = (1 - this._tweezersPinch * 0.08) / Math.max(1, this._zoom * 0.65);
            this._tweezersNode.setPosition(this._tweezersPos.x, this._tweezersPos.y - dip, 0);
            this._tweezersNode.setScale(sc, sc, 1);
            const alpha = this._isDragging ? 245 : Math.round(245 * (this._tweezersIdleTimer / 0.7));
            this._tweezersOpacity.opacity = Math.min(255, Math.max(0, alpha));
        } else {
            this._tweezersOpacity.opacity = 0;
        }

        // Ironing phase animations
        if (this._phase === 'ironing') {
            if (this._paperSlide < 1) {
                this._paperSlide = Math.min(1, this._paperSlide + cdt * 2.6);
            }
            if (this._ironDoneDelay >= 0) {
                this._ironDoneDelay -= cdt;
                if (this._ironDoneDelay <= 0 && this._phase === 'ironing') {
                    this._ironDoneDelay = -1;
                    this._phase = 'reveal';
                    this._peeling = false;
                    this._paperPeel = 0;
                    this._callbacks.onPhaseChanged('reveal');
                    this._dirty = true;
                }
            } else if (this._autoIroning) {
                this._autoIronTime += cdt;
                const dur = 2.8;
                const p = Math.min(1, this._autoIronTime / dur);
                const half = this._baseBoardSize * 0.44;
                const passes = 7;
                const y = half - p * (half * 2);
                const x = Math.sin(p * Math.PI * passes) * half;
                const prevX = this._ironTarget.x;
                this._ironTarget.set(x, y);
                this._ironVelX = (x - prevX) * 0.5;
                this._applyIronHeat(x, y, cdt * 2.4);
                if (p >= 1.0 && this._ironPercent < 100) {
                    // Only after completing the full edge-to-edge sweep, finish any sub-pixel rim heat
                    for (let i = 0; i < this._heat.length; i++) {
                        if (this._heat[i] < 1.0) this._heat[i] = 1.0;
                    }
                    this._recomputeIronProgress();
                    this._dirty = true;
                }
                if (this._phase === 'ironing' && this._autoIroning && this._ironDoneDelay < 0) {
                    AudioManager.ins.setSteam(true, 0.55);
                } else {
                    AudioManager.ins.setSteam(false);
                }
            } else if (this._ironPressed) {
                this._applyIronHeat(this._ironPos.x, this._ironPos.y, cdt * 0.92);
            }

            if (this._phase === 'ironing') {
                this._ironPos.x += (this._ironTarget.x - this._ironPos.x) * Math.min(1, cdt * 18);
                this._ironPos.y += (this._ironTarget.y - this._ironPos.y) * Math.min(1, cdt * 18);
                this._ironVelX *= Math.pow(0.05, cdt);

                if (this._ironPressed || this._autoIroning) {
                    this._steamSpawnAccum += cdt;
                    if (this._steamSpawnAccum >= 0.04) {
                        this._steamSpawnAccum = 0;
                        this._spawnSteamPuff(this._ironPos.x, this._ironPos.y);
                    }
                }
            }
        } else {
            AudioManager.ins.setSteam(false);
        }

        // Reveal phase peel animation
        if (this._phase === 'reveal' && this._peeling) {
            this._paperPeel = Math.min(1, this._paperPeel + cdt * 1.65);
            if (this._paperPeel >= 1) {
                this._phase = 'done';
                this._shineProgress = 0;
                this._spawnConfetti();
                AudioManager.ins.playComplete();
                this._callbacks.onPhaseChanged('done');
                this._callbacks.onRevealComplete();
            }
        }

        if (this._shineProgress >= 0 && this._shineProgress < 1) {
            this._shineProgress = Math.min(1, this._shineProgress + cdt * 1.15);
            needRedrawBoard = true;
        }

        for (let i = this._particles.length - 1; i >= 0; i--) {
            const pt = this._particles[i];
            pt.life += cdt;
            if (pt.life >= pt.maxLife) {
                this._particles.splice(i, 1);
                continue;
            }
            pt.x += pt.vx * cdt;
            pt.y += pt.vy * cdt;
            if (pt.kind === 'confetti') {
                pt.vy -= 360 * cdt;
                pt.rot += pt.vrot * cdt;
            } else if (pt.kind === 'spark') {
                pt.vy -= 180 * cdt;
            } else if (pt.kind === 'steam') {
                pt.r += 28 * cdt;
            } else if (pt.kind === 'ring') {
                pt.r += this._cellSize * 2.2 * cdt;
            }
        }

        if (needRedrawBoard) {
            this._drawBoard();
            this._dirty = false;
        }
        this._drawPaper();
        this._drawIron();
        this._drawVfx();
    }

    private _drawBoard(): void {
        const g = this._boardGfx;
        g.clear();

        const half = this._baseBoardSize / 2;
        const boardPal = getPegboardPalette(SaveManager.ins.activePegboard);
        const beadFinish = SaveManager.ins.activeBeadFinish;

        // 1. Multi-layer soft craft desk shadow under acrylic pegboard
        g.fillColor = new Color(68, 42, 28, 22);
        g.roundRect(-half - 4, -half - 14, this._baseBoardSize + 8, this._baseBoardSize + 4, 34);
        g.fill();
        g.fillColor = new Color(68, 42, 28, 32);
        g.roundRect(-half, -half - 7, this._baseBoardSize, this._baseBoardSize, 30);
        g.fill();

        // Interlocking Perler pegboard side puzzle tabs (authentic physical detail)
        const tabSize = 22;
        g.fillColor = boardPal.tab;
        for (const offset of [-140, 0, 140]) {
            g.roundRect(offset - tabSize / 2, half - 4, tabSize, 12, 5);
            g.roundRect(half - 4, offset - tabSize / 2, 12, tabSize, 5);
        }
        g.fill();

        // Frosted acrylic pegboard body
        g.fillColor = boardPal.body;
        g.roundRect(-half, -half, this._baseBoardSize, this._baseBoardSize, 30);
        g.fill();

        // Glass chamfered highlight border
        g.strokeColor = boardPal.innerBorder;
        g.lineWidth = 6;
        g.roundRect(-half + 3, -half + 3, this._baseBoardSize - 6, this._baseBoardSize - 6, 28);
        g.stroke();

        g.strokeColor = boardPal.outerBorder;
        g.lineWidth = 2.5;
        g.roundRect(-half, -half, this._baseBoardSize, this._baseBoardSize, 30);
        g.stroke();

        // Corner acrylic molding pins
        const rivet = half - 20;
        for (const [rx, ry] of [[-rivet, rivet], [rivet, rivet], [-rivet, -rivet], [rivet, -rivet]]) {
            g.fillColor = boardPal.rivet;
            g.circle(rx, ry, 5);
            g.fill();
            g.fillColor = new Color(255, 255, 255, 200);
            g.circle(rx - 1.5, ry + 1.5, 2);
            g.fill();
        }

        const cell = this._cellSize;

        if (this._useHdSprites) {
            // Fast, silky-smooth 256px LANCZOS anti-aliased Sprite layers (zero jagged curves at 5.5x zoom!)
            const bodyAlpha = beadFinish === 'jelly' ? 220 : 255;
            const specAlpha = beadFinish === 'jelly' || beadFinish === 'sparkle' ? 255 : beadFinish === 'pearl' ? 245 : 220;
            const specBoost = beadFinish === 'jelly' ? 1.18 : beadFinish === 'pearl' ? 1.12 : 1.0;

            for (let i = 0; i < this._cellSprites.length; i++) {
                const cs = this._cellSprites[i];
                const isFilled = this._filled.has(cs.idx);
                if (!isFilled) {
                    cs.peg.node.active = true;
                    cs.body.node.active = false;
                    if (cs.spec) cs.spec.node.active = false;
                    cs.fused.node.active = false;

                    const pos = this._cellLocalPos(cs.x, cs.y);
                    const isWrong = cs.idx === this._wrongCellIdx && this._wrongShakeTimer > 0;
                    const shakeX = isWrong ? Math.sin(this._wrongShakeTimer * 75) * 4.5 : 0;
                    cs.peg.node.setPosition(pos.x + shakeX, pos.y, 0);
                    if (cs.num) {
                        cs.num.node.active = true;
                        cs.num.node.setPosition(pos.x + shakeX, pos.y, 0);
                        cs.num.color = boardPal.isDark
                            ? new Color(242, 240, 255, 245)
                            : new Color(78, 54, 42, 245);
                    }

                    const isSelected = cs.cIdx === this._selectedColor && this._phase === 'coloring';
                    cs.peg.color = isWrong
                        ? new Color(255, 198, 206, 255)
                        : isSelected
                            ? boardPal.pegSelected
                            : boardPal.pegDefault;
                    continue;
                }

                cs.peg.node.active = false;
                if (cs.num) cs.num.node.active = false;
                let scale = 1.0;
                const ft = this._fillTimes.get(cs.idx);
                if (ft !== undefined) {
                    const age = this._elapsed - ft;
                    if (age < 0) {
                        cs.body.node.active = false;
                        if (cs.spec) cs.spec.node.active = false;
                        cs.fused.node.active = false;
                        continue;
                    }
                    scale = this._easeOutBack(Math.min(1, age / 0.24));
                }

                const heat = this._heat[cs.idx];
                const rgb = applyBeadFinishRgb(this._palette[cs.cIdx - 1], beadFinish);
                if (heat <= 0.01) {
                    cs.body.node.active = true;
                    cs.fused.node.active = false;
                    cs.body.node.setScale(scale, scale, 1);
                    cs.body.color = new Color(rgb.r, rgb.g, rgb.b, bodyAlpha);
                    if (cs.spec) {
                        cs.spec.node.active = true;
                        cs.spec.node.setScale(scale * specBoost, scale * specBoost, 1);
                        cs.spec.color = new Color(255, 255, 255, specAlpha);
                    }
                } else {
                    const meltFade = Math.max(0, 1 - heat * 1.15);
                    cs.body.node.active = meltFade > 0.02;
                    if (cs.spec) cs.spec.node.active = meltFade > 0.02;
                    if (meltFade > 0.02) {
                        cs.body.color = new Color(rgb.r, rgb.g, rgb.b, Math.round(bodyAlpha * meltFade));
                        cs.body.node.setScale(scale, scale, 1);
                        if (cs.spec) {
                            cs.spec.color = new Color(255, 255, 255, Math.round(specAlpha * meltFade));
                            cs.spec.node.setScale(scale * specBoost, scale * specBoost, 1);
                        }
                    }
                    cs.fused.node.active = true;
                    const fScale = scale * (0.86 + 0.14 * heat);
                    cs.fused.node.setScale(fScale, fScale, 1);
                    cs.fused.color = new Color(rgb.r, rgb.g, rgb.b, Math.round(Math.min(1, heat * 1.25) * 255));
                }
            }

            // Starlight sparkle glints for 'sparkle' bead finish
            if (beadFinish === 'sparkle') {
                g.fillColor = new Color(255, 255, 255, 225);
                for (let i = 0; i < this._cellSprites.length; i++) {
                    const cs = this._cellSprites[i];
                    if (!this._filled.has(cs.idx) || ((cs.x + cs.y) & 1) !== 0) continue;
                    const pos = this._cellLocalPos(cs.x, cs.y);
                    const sx = pos.x + cell * 0.18;
                    const sy = pos.y + cell * 0.18;
                    const sr = Math.max(2.2, cell * 0.16);
                    g.moveTo(sx, sy + sr);
                    g.lineTo(sx + sr * 0.3, sy + sr * 0.3);
                    g.lineTo(sx + sr, sy);
                    g.lineTo(sx + sr * 0.3, sy - sr * 0.3);
                    g.lineTo(sx, sy - sr);
                    g.lineTo(sx - sr * 0.3, sy - sr * 0.3);
                    g.lineTo(sx - sr, sy);
                    g.lineTo(sx - sr * 0.3, sy + sr * 0.3);
                    g.close();
                }
                g.fill();
            }

            // Seamless melted plastic bridges between adjacent heated beads
            for (let y = 0; y < this._level.height; y++) {
                for (let x = 0; x < this._level.width; x++) {
                    const cIdx = cellColorIndex(this._level, x, y);
                    if (cIdx === 0) continue;
                    const idx = y * this._level.width + x;
                    if (!this._filled.has(idx)) continue;
                    const heat = this._heat[idx];
                    if (heat <= 0.35) continue;

                    const pos = this._cellLocalPos(x, y);
                    const rgb = applyBeadFinishRgb(this._palette[cIdx - 1], beadFinish);
                    const alpha = Math.round(Math.min(1, (heat - 0.35) / 0.55) * 255);
                    g.fillColor = new Color(rgb.r, rgb.g, rgb.b, alpha);

                    if (x + 1 < this._level.width) {
                        const rIdx = y * this._level.width + (x + 1);
                        if (cellColorIndex(this._level, x + 1, y) > 0 && this._heat[rIdx] > 0.35) {
                            g.rect(pos.x, pos.y - cell * 0.46, cell * 0.56, cell * 0.92);
                            g.fill();
                        }
                    }
                    if (y + 1 < this._level.height) {
                        const bIdx = (y + 1) * this._level.width + x;
                        if (cellColorIndex(this._level, x, y + 1) > 0 && this._heat[bIdx] > 0.35) {
                            g.rect(pos.x - cell * 0.46, pos.y - cell * 0.56, cell * 0.92, cell * 0.56);
                            g.fill();
                        }
                    }
                }
            }
        } else {
            // Fallback vector path if HD sprites unavailable
            for (let y = 0; y < this._level.height; y++) {
                for (let x = 0; x < this._level.width; x++) {
                    const cIdx = cellColorIndex(this._level, x, y);
                    if (cIdx === 0) continue;
                    const idx = y * this._level.width + x;
                    if (this._filled.has(idx)) continue;

                    const pos = this._cellLocalPos(x, y);
                    let cx = pos.x;
                    const cy = pos.y;
                    if (idx === this._wrongCellIdx && this._wrongShakeTimer > 0) {
                        cx += Math.sin(this._wrongShakeTimer * 75) * 4.5;
                    }

                    const isSelected = cIdx === this._selectedColor && this._phase === 'coloring';
                    const isWrong = idx === this._wrongCellIdx && this._wrongShakeTimer > 0;

                    g.fillColor = isWrong
                        ? new Color(255, 206, 212, 255)
                        : isSelected
                            ? boardPal.pegSelected
                            : boardPal.pegDefault;
                    g.circle(cx, cy, cell * 0.44);
                    g.fill();
                }
            }
        }

        // 5. Diagonal Glossy Shine Sweep on reveal completion
        if (this._shineProgress >= 0 && this._shineProgress < 1) {
            const p = this._shineProgress;
            const sweepX = -half - 160 + (this._baseBoardSize + 320) * p;
            g.fillColor = new Color(255, 255, 255, 95);
            g.moveTo(sweepX, -half);
            g.lineTo(sweepX + 85, -half);
            g.lineTo(sweepX + 205, half);
            g.lineTo(sweepX + 120, half);
            g.close();
            g.fill();
        }
    }

    private _drawPaper(): void {
        const g = this._paperGfx;
        g.clear();
        const showPaper = this._phase === 'ironing' || this._phase === 'reveal';
        this._paperNode.active = showPaper;
        if (!showPaper) return;

        const half = (this._baseBoardSize * 0.96) / 2;
        const slideOffsetY = (1 - this._easeOutCubic(this._paperSlide)) * 420;
        const peelEase = this._easeInCubic(this._paperPeel);
        const peelOffsetY = peelEase * 560;
        const peelOffsetX = peelEase * 160;

        this._paperNode.setPosition(peelOffsetX, slideOffsetY + peelOffsetY, 0);
        if (this._paperOpacity) {
            this._paperOpacity.opacity = Math.round((1 - this._paperPeel * 0.88) * 172);
        } else {
            g.fillColor = new Color(255, 252, 245, Math.round((1 - this._paperPeel * 0.88) * 145));
            g.roundRect(-half, -half, half * 2, half * 2, 18);
            g.fill();
        }

        // Crisp paper rim
        g.strokeColor = new Color(230, 214, 195, Math.round((1 - this._paperPeel) * 210));
        g.lineWidth = 3;
        g.roundRect(-half, -half, half * 2, half * 2, 14);
        g.stroke();

        // Curled bottom-right corner prompt during 'reveal'
        if (this._phase === 'reveal') {
            const pulse = this._peeling ? 1.35 : 1 + Math.sin(this._elapsed * 5) * 0.12;
            const fold = (66 + this._paperPeel * 120) * pulse;
            // Under-curl shadow
            g.fillColor = new Color(92, 62, 42, 42);
            g.moveTo(half - fold, -half);
            g.lineTo(half, -half + fold);
            g.lineTo(half - fold * 0.88, -half + fold * 0.88);
            g.close();
            g.fill();
            // Folded parchment flap
            g.fillColor = new Color(252, 244, 232, 242);
            g.moveTo(half - fold, -half);
            g.lineTo(half, -half + fold);
            g.lineTo(half - fold * 0.78, -half + fold * 0.78);
            g.close();
            g.fill();
            g.strokeColor = new Color(214, 194, 170, 220);
            g.lineWidth = 2;
            g.stroke();
        }
    }

    private _drawIron(): void {
        const showIron = this._phase === 'ironing';
        this._ironNode.active = showIron;
        if (!showIron) return;

        const ix = this._ironPos.x;
        const iy = this._ironPos.y;
        const tiltDeg = Math.max(-14, Math.min(14, -this._ironVelX * 0.45));
        this._ironNode.setPosition(ix, iy, 0);
        this._ironNode.setRotationFromEuler(0, 0, tiltDeg);

        const g = this._ironGlowGfx;
        g.clear();

        // Soft floor shadow
        g.fillColor = new Color(56, 36, 26, 48);
        g.ellipse(8, -12, 64, 34);
        g.fill();

        // Warm thermal heating aura when pressed/active
        if (this._ironPressed || this._autoIroning) {
            const pulse = 1 + Math.sin(this._elapsed * 14) * 0.08;
            g.fillColor = new Color(255, 120, 72, 68);
            g.circle(0, 0, 82 * pulse);
            g.fill();
            g.fillColor = new Color(255, 175, 92, 52);
            g.circle(0, 0, 56 * pulse);
            g.fill();
        }

        if (this._ironFallbackGfx) {
            const fg = this._ironFallbackGfx;
            fg.clear();
            fg.fillColor = THEME.primary;
            fg.circle(0, 12, 46);
            fg.fill();
        }
    }

    private _drawVfx(): void {
        const g = this._vfxGfx;
        g.clear();

        // Highlight remaining unmelted beads during late ironing (>= 85%) so players can spot missed corners
        if (this._phase === 'ironing' && this._ironPercent >= 85 && this._ironPercent < 100) {
            const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this._elapsed * 7));
            g.fillColor = new Color(255, 118, 72, Math.round(165 * pulse));
            const s = Math.max(3.6, this._cellSize * 0.56);
            const hs = s * 0.5;
            for (let y = 0; y < this._level.height; y++) {
                for (let x = 0; x < this._level.width; x++) {
                    if (cellColorIndex(this._level, x, y) === 0) continue;
                    const idx = y * this._level.width + x;
                    if (this._heat[idx] >= 0.98) continue;
                    const pos = this._cellLocalPos(x, y);
                    g.rect(pos.x - hs, pos.y - hs, s, s);
                }
            }
            g.fill();
        }

        if (this._hintRingTimer > 0 && this._hintCellIdx >= 0) {
            const x = this._hintCellIdx % this._level.width;
            const y = Math.floor(this._hintCellIdx / this._level.width);
            const pos = this._cellLocalPos(x, y);
            const p = 1 - this._hintRingTimer / 1.1;
            const r = this._cellSize * (0.5 + p * 1.45);
            g.strokeColor = new Color(255, 107, 139, Math.round(255 * (1 - p)));
            g.lineWidth = 4;
            g.circle(pos.x, pos.y, r);
            g.stroke();
        }

        for (const pt of this._particles) {
            const p = pt.life / pt.maxLife;
            const alpha = Math.round(pt.color.a * (1 - p));
            if (pt.kind === 'ring') {
                g.strokeColor = new Color(pt.color.r, pt.color.g, pt.color.b, alpha);
                g.lineWidth = 3 * (1 - p);
                g.circle(pt.x, pt.y, pt.r);
                g.stroke();
                continue;
            }
            g.fillColor = new Color(pt.color.r, pt.color.g, pt.color.b, alpha);
            if (pt.kind === 'confetti') {
                g.rect(pt.x - pt.r * 0.5, pt.y - pt.r * 0.35, pt.r, pt.r * 0.7);
                g.fill();
            } else {
                g.circle(pt.x, pt.y, pt.r * (pt.kind === 'spark' ? 1 - p * 0.5 : 1));
                g.fill();
            }
        }
    }

    private _easeOutBack(t: number): number {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    private _easeOutCubic(t: number): number {
        return 1 - Math.pow(1 - t, 3);
    }

    private _easeInCubic(t: number): number {
        return t * t * t;
    }
}
