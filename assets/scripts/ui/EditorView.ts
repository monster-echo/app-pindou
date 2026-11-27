import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Mask,
    Node,
    ScrollView,
    Sprite,
    UITransform,
    Vec3,
} from 'cc';
import { AdManager } from '../core/AdManager';
import { AudioManager } from '../core/AudioManager';
import { levelName, t } from '../core/I18n';
import { formatDuration } from '../core/LeaderboardManager';
import { LevelManager } from '../core/LevelManager';
import { ResManager } from '../core/ResManager';
import { SaveManager } from '../core/SaveManager';
import { EditorPhase, LevelData, calcStageCoinReward, calcStageXpReward, cellColorIndex, hexToRgb } from '../core/Types';
import { BeadBoardView } from '../game/BeadBoardView';
import type { LayoutMetrics } from '../PindouApp';
import { showBoosterRefillModal } from './HomeModals';
import {
    THEME,
    addFullStretchWidget,
    createIconSprite,
    createLabel,
    createNode,
    createPillButton,
    createUiSprite,
    drawLevelThumbnail,
    drawRoundedBox,
    drawSingle3DBead,
    playCoinBurstEffect,
} from './UIHelper';

const { ccclass } = _decorator;

@ccclass('EditorView')
export class EditorView extends Component {
    private _level!: LevelData;
    private _metrics!: LayoutMetrics;
    private _onBackHome!: () => void;
    private _onOpenLevel!: (lv: LevelData) => void;

    private _board!: BeadBoardView;
    private _boardW = 750;
    private _boardH = 810;
    private _titleLabel!: Label;
    private _subtitleLabel!: Label;
    private _hintBtnLabel!: Label;
    private _bucketBtnLabel!: Label;
    private _bucketBtnIcon: Sprite | null = null;
    private _magicBtnLabel!: Label;
    private _magicBtnIcon: Sprite | null = null;
    private _fitBtnLabel!: Label;

    // Bottom phase panels
    private _coloringPanel!: Node;
    private _paletteContent!: Node;
    private _ironingPanel!: Node;
    private _ironPctLabel!: Label;
    private _ironBarFill!: Graphics;
    private _autoIronBtnLabel!: Label;
    private _revealPanel!: Node;
    private _peelBtnLabel!: Label;
    private _donePanel!: Node;
    private _replayBtnLabel!: Label;
    private _nextBtnLabel!: Label;

    // Session timer & Rewards
    private _sessionSeconds = 0;
    private _isPaused = false;

    // Toast & Celebration Modal
    private _toastNode!: Node;
    private _toastLabel!: Label;
    private _toastTimer = 0;
    private _modalOverlay!: Node;

    public init(
        metrics: LayoutMetrics,
        onBackHome: () => void,
        onOpenLevel: (lv: LevelData) => void,
    ): void {
        this._metrics = metrics;
        this._onBackHome = onBackHome;
        this._onOpenLevel = onOpenLevel;

        const ui = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        ui.setContentSize(metrics.canvasW, metrics.canvasH);
        addFullStretchWidget(this.node);

        this._buildTopBar();
        this._buildBoardContainer();
        this._buildBottomPanels();
        this._buildToast();
        this._buildModal();
    }

    public openLevel(level: LevelData): void {
        this._level = level;
        this._modalOverlay.active = false;
        this._isPaused = false;
        this._sessionSeconds = 0;
        const save = SaveManager.ins.getLevelSave(level.id);

        const prefix = level.mode === 'challenge' ? t('edChallengeTag') : t('edStageTag', level.stage);
        this._titleLabel.string = `${prefix} · ${levelName(level)}`;
        this._syncLocalizedLabels();
        this._refreshBoosterLabels();

        this._board.setup(level, save.filled, save.ironed, this._boardW, this._boardH, {
            onProgressChanged: (filledCount, total) => {
                this._saveCurrent();
                this._updateSubtitle(filledCount, total);
                this._renderPalette();
            },
            onColorCompleted: () => {
                this._renderPalette();
            },
            onPhaseChanged: (phase) => {
                this._syncPhasePanels(phase);
            },
            onIronProgressChanged: (pct) => {
                this._updateIronProgress(pct);
            },
            onRevealComplete: () => {
                const already = SaveManager.ins.isCompleted(this._level);
                const clearSecs = Math.max(8, Math.round(this._sessionSeconds));
                SaveManager.ins.saveProgress(this._level.id, this._board.filled, true, clearSecs);

                const earnedCoins = calcStageCoinReward(this._level, already);
                const earnedXp = calcStageXpReward(this._level, already);
                if (this._level.mode === 'main') {
                    const mains = LevelManager.ins.mainLevels;
                    const idx = LevelManager.ins.getMainStageIndex(this._level.id);
                    if (idx >= 0) {
                        SaveManager.ins.advanceStageIfCurrent(idx, mains.length);
                    }
                }
                this.scheduleOnce(() => {
                    this._showCompletionModal(clearSecs, earnedCoins, earnedXp);
                }, 0.85);
            },
            onWrongCell: () => {
                // Error SFX + red cell shake already communicate mismatch cleanly
            },
        });

        this._updateSubtitle(save.filled.length, level.total);
        this._renderPalette();
        this._syncPhasePanels(this._board.phase);
    }

    private _syncLocalizedLabels(): void {
        if (this._hintBtnLabel) this._hintBtnLabel.string = t('edHint');
        if (this._fitBtnLabel) this._fitBtnLabel.string = t('edFit');
        if (this._autoIronBtnLabel) this._autoIronBtnLabel.string = t('edAutoIron');
        if (this._peelBtnLabel) this._peelBtnLabel.string = t('edPeelBtn');
        if (this._replayBtnLabel) this._replayBtnLabel.string = t('edReplay');
        if (this._nextBtnLabel) this._nextBtnLabel.string = t('edNext');
    }

    private _refreshBoosterLabels(): void {
        const fc = SaveManager.ins.floodCharges;
        if (this._bucketBtnLabel) {
            this._bucketBtnLabel.string = fc > 0 ? t('edBucketHave', fc) : t('edBucketZero');
        }
        if (this._bucketBtnIcon) {
            const bSf = ResManager.ins.getIcon('icon_bucket');
            if (bSf) this._bucketBtnIcon.spriteFrame = bSf;
        }
        const mc = SaveManager.ins.magicCharges;
        if (this._magicBtnLabel) {
            this._magicBtnLabel.string = mc > 0 ? t('edMagicHave', mc) : t('edMagicZero');
        }
        if (this._magicBtnIcon) {
            const mSf = ResManager.ins.getIcon('icon_magic');
            if (mSf) this._magicBtnIcon.spriteFrame = mSf;
        }
    }

    private _saveCurrent(): void {
        if (!this._level || !this._board) return;
        const isDone = this._board.phase === 'done';
        SaveManager.ins.saveProgress(this._level.id, this._board.filled, isDone);
    }

    private _buildTopBar(): void {
        const { canvasH, topInset } = this._metrics;
        const barH = 122 + topInset;
        const bar = createNode('TopBar', this.node, 750, barH);
        bar.setPosition(0, canvasH / 2 - barH / 2, 0);

        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(255, 252, 248, 236);
        bg.rect(-375, -barH / 2, 750, barH);
        bg.fill();
        bg.fillColor = new Color(235, 218, 200, 210);
        bg.rect(-375, -barH / 2, 750, 2);
        bg.fill();

        const cy = -topInset / 2;

        // Single clean Pause button (houses Resume, Sound, Restart, Home)
        const pauseBtn = createNode('PauseBtn', bar, 60, 60);
        pauseBtn.setPosition(-312, cy - 2, 0);
        createUiSprite('Bg', pauseBtn, 'btn_circle_cream', 72, 72)?.node.setPosition(0, -1, 0);
        const pg = createNode('PauseIcon', pauseBtn, 28, 28).addComponent(Graphics);
        pg.fillColor = THEME.text;
        pg.roundRect(-8, -11, 5.5, 22, 2.5);
        pg.roundRect(2.5, -11, 5.5, 22, 2.5);
        pg.fill();
        const pb = pauseBtn.addComponent(Button);
        pb.transition = Button.Transition.SCALE;
        pb.zoomScale = 0.92;
        pauseBtn.on(Button.EventType.CLICK, () => {
            AudioManager.ins.playClick();
            this._showPauseModal();
        });

        this._titleLabel = createLabel('Title', bar, '', 27, THEME.text, true, 520, 38);
        this._titleLabel.node.setPosition(14, cy + 16, 0);

        this._subtitleLabel = createLabel('Subtitle', bar, '', 19, THEME.textSub, false, 520, 28);
        this._subtitleLabel.node.setPosition(14, cy - 22, 0);
    }

    private _buildBoardContainer(): void {
        const { canvasH, topInset, bottomInset } = this._metrics;
        const topH = 122 + topInset;
        const dockH = 336 + bottomInset;
        this._boardW = 750;
        this._boardH = Math.max(660, canvasH - topH - dockH);

        const centerY = canvasH / 2 - topH - this._boardH / 2;
        const boardNode = createNode('BeadBoard', this.node, this._boardW, this._boardH);
        boardNode.setPosition(0, centerY, 0);
        this._board = boardNode.addComponent(BeadBoardView);
    }

    private _buildBottomPanels(): void {
        const { canvasH, bottomInset } = this._metrics;
        const dockH = 336 + bottomInset;
        const dock = createNode('BottomDock', this.node, 750, dockH);
        dock.setPosition(0, -canvasH / 2 + dockH / 2, 0);

        const bg = dock.addComponent(Graphics);
        drawRoundedBox(
            bg,
            746,
            dockH,
            32,
            new Color(255, 252, 248, 246),
            THEME.cardBorder,
            2.5,
            true,
        );

        const panelOffsetY = bottomInset / 2;

        // 1. Coloring Panel (4 Tactical Boosters + Acrylic Bead Tray)
        this._coloringPanel = createNode('ColoringPanel', dock, 750, 336);
        this._coloringPanel.setPosition(0, panelOffsetY, 0);

        const hintBtn = createPillButton(
            'HintBtn',
            this._coloringPanel,
            t('edHint'),
            168,
            56,
            new Color(255, 248, 240, 255),
            new Color(148, 86, 12, 255),
            () => {
                AudioManager.ins.playClick();
                if (!this._board.useHint()) this.showToast(t('edToastNoHint'));
            },
            20,
            new Color(246, 206, 134, 255),
            'icon_hint',
            26,
            'btn_cream',
        );
        hintBtn.setPosition(-270, 108, 0);
        this._hintBtnLabel = hintBtn.getChildByName('Label')!.getComponent(Label)!;

        const bucketBtn = createPillButton(
            'BucketBtn',
            this._coloringPanel,
            t('edBucketHave', 3),
            174,
            56,
            THEME.mint,
            Color.WHITE,
            () => {
                AudioManager.ins.playClick();
                if (SaveManager.ins.floodCharges > 0) {
                    if (this._board.useBucket()) {
                        SaveManager.ins.consumeFloodCharge();
                        this._refreshBoosterLabels();
                    } else {
                        this.showToast(t('edToastColorFull'));
                    }
                    return;
                }
                showBoosterRefillModal(
                    this.node,
                    this._metrics,
                    'flood',
                    (msg) => this.showToast(msg),
                    () => this._refreshBoosterLabels(),
                );
            },
            20,
            undefined,
            'icon_bucket',
            26,
            'btn_mint',
        );
        bucketBtn.setPosition(-90, 108, 0);
        this._bucketBtnLabel = bucketBtn.getChildByName('Label')!.getComponent(Label)!;
        this._bucketBtnIcon = bucketBtn.getChildByName('Icon')?.getComponent(Sprite) || null;

        const magicBtn = createPillButton(
            'MagicBtn',
            this._coloringPanel,
            t('edMagicHave', 2),
            174,
            56,
            new Color(148, 92, 246, 255),
            Color.WHITE,
            () => {
                AudioManager.ins.playClick();
                if (SaveManager.ins.magicCharges > 0) {
                    const magicCap = Math.max(25, Math.min(200, Math.round(this._level.total * 0.03)));
                    const placed = this._board.useMagicFill(magicCap);
                    if (placed > 0) {
                        SaveManager.ins.consumeMagicCharge();
                        this._refreshBoosterLabels();
                        this.showToast(t('edToastMagicFill', placed));
                    } else {
                        this.showToast(t('edToastNoHint'));
                    }
                    return;
                }
                showBoosterRefillModal(
                    this.node,
                    this._metrics,
                    'magic',
                    (msg) => this.showToast(msg),
                    () => this._refreshBoosterLabels(),
                );
            },
            20,
            undefined,
            'icon_magic',
            26,
            'btn_purple',
        );
        magicBtn.setPosition(90, 108, 0);
        this._magicBtnLabel = magicBtn.getChildByName('Label')!.getComponent(Label)!;
        this._magicBtnIcon = magicBtn.getChildByName('Icon')?.getComponent(Sprite) || null;

        const fitBtn = createPillButton(
            'FitBtn',
            this._coloringPanel,
            t('edFit'),
            168,
            56,
            new Color(255, 248, 240, 255),
            THEME.text,
            () => {
                AudioManager.ins.playClick();
                this._board.resetView();
            },
            20,
            THEME.cardBorder,
            'icon_zoom',
            24,
            'btn_cream',
        );
        fitBtn.setPosition(270, 108, 0);
        this._fitBtnLabel = fitBtn.getChildByName('Label')!.getComponent(Label)!;

        // Horizontal Scrollable Physical Bead Compartment Tray
        const palWrap = createNode('PaletteWrap', this._coloringPanel, 730, 192);
        palWrap.setPosition(0, -34, 0);
        const palView = createNode('PalView', palWrap, 730, 192);
        palView.addComponent(Mask);

        this._paletteContent = createNode('PalContent', palView, 730, 192);
        this._paletteContent.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        this._paletteContent.setPosition(-365, 0, 0);

        const sv = palWrap.addComponent(ScrollView);
        sv.content = this._paletteContent;
        sv.horizontal = true;
        sv.vertical = false;
        sv.elastic = true;
        sv.inertia = true;

        // 2. Ironing Panel (mini iron icon + progress bar + Auto Iron)
        this._ironingPanel = createNode('IroningPanel', dock, 750, 336);
        this._ironingPanel.setPosition(0, panelOffsetY, 0);
        const ironSf = ResManager.ins.getTexture('iron_sprite');
        if (ironSf) {
            const miniIron = createNode('MiniIron', this._ironingPanel, 64, 64);
            miniIron.setPosition(-72, 66, 0);
            const sp = miniIron.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = ironSf;
        }
        this._ironPctLabel = createLabel('IronPct', this._ironingPanel, t('edIronPct', 0), 30, THEME.primary, true, 160, 40);
        this._ironPctLabel.node.setPosition(36, 66, 0);

        const barTrack = createNode('IronBar', this._ironingPanel, 560, 26);
        barTrack.setPosition(0, 12, 0);
        const tg = barTrack.addComponent(Graphics);
        drawRoundedBox(tg, 560, 26, 13, new Color(242, 232, 222, 255));

        const barFillNode = createNode('IronBarFill', barTrack, 560, 26);
        this._ironBarFill = barFillNode.addComponent(Graphics);

        const autoIronBtn = createPillButton(
            'AutoIronBtn',
            this._ironingPanel,
            t('edAutoIron'),
            290,
            66,
            THEME.primary,
            Color.WHITE,
            () => {
                AudioManager.ins.playClick();
                this._board.triggerAutoIron();
            },
            25,
            undefined,
            'icon_star',
            26,
        );
        autoIronBtn.setPosition(0, -78, 0);
        this._autoIronBtnLabel = autoIronBtn.getChildByName('Label')!.getComponent(Label)!;

        // 3. Reveal Panel (icon + button only, parchment corner curl shows interaction)
        this._revealPanel = createNode('RevealPanel', dock, 750, 336);
        this._revealPanel.setPosition(0, panelOffsetY, 0);

        const peelBtn = createPillButton(
            'PeelBtn',
            this._revealPanel,
            t('edPeelBtn'),
            340,
            80,
            THEME.primary,
            Color.WHITE,
            () => {
                this._board.triggerPeel();
            },
            28,
            undefined,
            'icon_star',
            30,
        );
        peelBtn.setPosition(0, 8, 0);
        this._peelBtnLabel = peelBtn.getChildByName('Label')!.getComponent(Label)!;
        this._revealPanel.on(Node.EventType.TOUCH_END, () => {
            this._board.triggerPeel();
        });

        // 4. Done Panel (gold stars + Replay / Next)
        this._donePanel = createNode('DonePanel', dock, 750, 336);
        this._donePanel.setPosition(0, panelOffsetY, 0);
        for (const [sx, sy, sz] of [[-46, 72, 32], [0, 82, 42], [46, 72, 32]]) {
            const st = createIconSprite('DoneStar', this._donePanel, 'icon_star', sz);
            if (st) st.node.setPosition(sx, sy, 0);
        }

        const replayBtn = createPillButton(
            'ReplayBtn',
            this._donePanel,
            t('edReplay'),
            224,
            68,
            new Color(255, 248, 240, 255),
            THEME.text,
            () => {
                AudioManager.ins.playClick();
                this._board.restartLevel();
                this._sessionSeconds = 0;
                this._saveCurrent();
                this._renderPalette();
            },
            25,
            THEME.cardBorder,
            'icon_restart',
            26,
        );
        replayBtn.setPosition(-135, -32, 0);
        this._replayBtnLabel = replayBtn.getChildByName('Label')!.getComponent(Label)!;

        const nextBtn = createPillButton(
            'NextBtn',
            this._donePanel,
            t('edNext'),
            240,
            68,
            THEME.primary,
            Color.WHITE,
            () => {
                AudioManager.ins.playClick();
                const next = LevelManager.ins.getNextSequentialStage(this._level.id);
                if (next) this._onOpenLevel(next);
            },
            26,
        );
        nextBtn.setPosition(135, -32, 0);
        this._nextBtnLabel = nextBtn.getChildByName('Label')!.getComponent(Label)!;
    }

    private _buildToast(): void {
        const { canvasH, topInset } = this._metrics;
        this._toastNode = createNode('Toast', this.node, 560, 62);
        this._toastNode.setPosition(0, canvasH / 2 - 122 - topInset - 44, 0);
        const g = this._toastNode.addComponent(Graphics);
        drawRoundedBox(g, 560, 62, 31, new Color(56, 38, 30, 224));
        this._toastLabel = createLabel('Lbl', this._toastNode, '', 22, Color.WHITE, false, 520, 36);
        this._toastNode.active = false;
    }

    private _buildModal(): void {
        const { canvasW, canvasH } = this._metrics;
        this._modalOverlay = createNode('CompletionModal', this.node, canvasW, canvasH);
        const dim = this._modalOverlay.addComponent(Graphics);
        dim.fillColor = new Color(36, 24, 20, 165);
        dim.rect(-canvasW / 2, -canvasH / 2, canvasW, canvasH);
        dim.fill();
        this._modalOverlay.addComponent(Button);
        this._modalOverlay.active = false;
    }

    private _showPauseModal(): void {
        this._isPaused = true;
        AudioManager.ins.setSteam(false);
        this._modalOverlay.removeAllChildren();
        this._modalOverlay.active = true;

        const card = createNode('PauseCard', this._modalOverlay, 520, 520);
        if (!createUiSprite('CardBg', card, 'panel_card', 546, 546)) {
            drawRoundedBox(card.addComponent(Graphics), 520, 520, 34, Color.WHITE, THEME.cardBorder, 3, true);
        } else {
            card.getChildByName('CardBg')?.setPosition(0, -2, 0);
        }

        createLabel('Title', card, t('pauseTitle'), 32, THEME.text, true, 400, 44).node.setPosition(0, 198, 0);

        createPillButton(
            'ResumeBtn',
            card,
            t('pauseResume'),
            360,
            66,
            THEME.primary,
            Color.WHITE,
            () => {
                AudioManager.ins.playClick();
                this._isPaused = false;
                this._modalOverlay.active = false;
            },
            24,
            undefined,
            undefined,
            0,
            'btn_pink',
        ).setPosition(0, 108, 0);

        const isOn = SaveManager.ins.soundOn;
        createPillButton(
            'SoundBtn',
            card,
            isOn ? t('setSoundOn') : t('setSoundOff'),
            360,
            62,
            isOn ? THEME.mint : THEME.bg,
            isOn ? Color.WHITE : THEME.text,
            () => {
                const next = !SaveManager.ins.soundOn;
                SaveManager.ins.setSoundOn(next);
                if (next) AudioManager.ins.playClick();
                else AudioManager.ins.setSteam(false);
                this._showPauseModal();
            },
            22,
            undefined,
            isOn ? 'icon_sound_on' : 'icon_sound_off',
            26,
            isOn ? 'btn_mint' : 'btn_cream',
        ).setPosition(0, 22, 0);

        createPillButton(
            'RestartBtn',
            card,
            t('pauseRestart'),
            360,
            62,
            THEME.bg,
            THEME.text,
            () => {
                AudioManager.ins.playClick();
                this._isPaused = false;
                this._modalOverlay.active = false;
                this._board.restartLevel();
                this._sessionSeconds = 0;
                this._saveCurrent();
                this._renderPalette();
            },
            22,
            THEME.cardBorder,
            'icon_restart',
            26,
            'btn_cream',
        ).setPosition(0, -64, 0);

        createPillButton(
            'HomeBtn',
            card,
            t('backHome'),
            360,
            62,
            THEME.bg,
            THEME.text,
            () => {
                AudioManager.ins.playClick();
                this._isPaused = false;
                this._modalOverlay.active = false;
                this._saveCurrent();
                this._onBackHome();
            },
            22,
            THEME.cardBorder,
            'icon_back',
            24,
            'btn_cream',
        ).setPosition(0, -150, 0);
    }

    private _showCompletionModal(clearSecs: number, baseCoins: number, baseXp: number): void {
        this._modalOverlay.removeAllChildren();
        this._modalOverlay.active = true;

        const card = createNode('ModalCard', this._modalOverlay, 620, 770);
        if (!createUiSprite('CardBg', card, 'panel_card', 646, 796)) {
            drawRoundedBox(card.addComponent(Graphics), 620, 770, 36, Color.WHITE, THEME.gold, 4, true);
        } else {
            card.getChildByName('CardBg')?.setPosition(0, -2, 0);
        }

        for (const [sx, sy, sz] of [[-58, 320, 34], [0, 332, 44], [58, 320, 34]]) {
            const st = createIconSprite('ModalStar', card, 'icon_star', sz);
            if (st) st.node.setPosition(sx, sy, 0);
        }

        createLabel('Congrats', card, t('edModalTitle'), 34, THEME.text, true, 540, 44).node.setPosition(0, 270, 0);
        createLabel(
            'ArtName',
            card,
            t('edModalSub', levelName(this._level), formatDuration(clearSecs)),
            21,
            THEME.textSub,
            false,
            540,
            32,
        ).node.setPosition(0, 226, 0);

        const ringNode = createNode('KeychainRing', card, 100, 70);
        ringNode.setPosition(0, 184, 0);
        const rg = ringNode.addComponent(Graphics);
        rg.strokeColor = new Color(218, 154, 36, 255);
        rg.lineWidth = 7;
        rg.circle(0, 12, 20);
        rg.stroke();
        rg.fillColor = new Color(218, 154, 36, 255);
        rg.roundRect(-6, -22, 12, 22, 5);
        rg.fill();

        const previewNode = createNode('FinishedPreview', card, 300, 300);
        previewNode.setPosition(0, 14, 0);
        const pg = previewNode.addComponent(Graphics);
        drawLevelThumbnail(pg, this._level, 300, this._board.filled, true, true);

        const rewardBox = createNode('RewardSummary', card, 524, 84);
        rewardBox.setPosition(0, -190, 0);
        if (!createUiSprite('Bg', rewardBox, 'card_row', 540, 96)) {
            drawRoundedBox(rewardBox.addComponent(Graphics), 524, 84, 24, new Color(255, 246, 228, 255), THEME.gold, 2);
        } else {
            rewardBox.getChildByName('Bg')?.setPosition(0, -2, 0);
        }
        createLabel(
            'BaseReward',
            rewardBox,
            t('edModalReward', baseCoins, baseXp),
            20,
            THEME.textSub,
            false,
            490,
            28,
        ).node.setPosition(0, 16, 0);
        createLabel(
            'AllReward',
            rewardBox,
            t('edModalAllBonus', baseCoins * 3, baseXp * 3),
            22,
            new Color(192, 92, 24, 255),
            true,
            490,
            32,
        ).node.setPosition(0, -16, 0);

        let claimed = false;
        let claimingAd = false;

        const claimBtn = createPillButton(
            'ClaimNormalBtn',
            card,
            t('edModalClaim'),
            224,
            66,
            new Color(255, 248, 240, 255),
            THEME.text,
            () => {
                if (claimed || claimingAd) return;
                claimed = true;
                AudioManager.ins.playClick();
                SaveManager.ins.addCoins(baseCoins);
                SaveManager.ins.addXp(baseXp);
                this._modalOverlay.active = false;
                const topTargetY = this._metrics.canvasH / 2 - this._metrics.topInset - 62;
                playCoinBurstEffect(this.node, new Vec3(-136, -296, 0), new Vec3(0, topTargetY, 0), baseCoins, null, 8, true);
            },
            25,
            THEME.cardBorder,
            undefined,
            24,
            'btn_cream',
        );
        claimBtn.setPosition(-136, -296, 0);

        const claimAllBtn = createPillButton(
            'ClaimAllAdBtn',
            card,
            t('edModalClaimAll'),
            276,
            66,
            THEME.primary,
            Color.WHITE,
            async () => {
                if (claimed || claimingAd) return;
                claimingAd = true;
                AudioManager.ins.playClick();
                const ok = await AdManager.ins.showRewardedAd('clear_triple');
                claimingAd = false;
                if (ok) {
                    claimed = true;
                    const tripleCoins = baseCoins * 3;
                    SaveManager.ins.addCoins(tripleCoins);
                    SaveManager.ins.addXp(baseXp * 3);
                    this._modalOverlay.active = false;
                    const topTargetY = this._metrics.canvasH / 2 - this._metrics.topInset - 62;
                    playCoinBurstEffect(this.node, new Vec3(124, -296, 0), new Vec3(0, topTargetY, 0), tripleCoins, null, 12, true);
                } else {
                    this.showToast(t('edModalAdCancel'));
                }
            },
            25,
            undefined,
            'icon_ad',
            26,
            'btn_pink',
        );
        claimAllBtn.setPosition(124, -296, 0);
    }

    /** Render Palette as physical Acrylic Bead Compartment Tray with tumbled mini 3D beads! */
    private _renderPalette(): void {
        if (!this._level || !this._board) return;
        this._paletteContent.removeAllChildren();

        const itemW = 122;
        const gap = 14;
        let curX = 20;

        for (let i = 0; i < this._level.colors.length; i++) {
            const cNum = i + 1;
            let total = 0;
            let done = 0;
            for (let y = 0; y < this._level.height; y++) {
                for (let x = 0; x < this._level.width; x++) {
                    if (cellColorIndex(this._level, x, y) === cNum) {
                        total++;
                        if (this._board.filled.has(y * this._level.width + x)) done++;
                    }
                }
            }
            const ratio = total > 0 ? done / total : 1;
            const isDone = total > 0 && done >= total;
            const selected = this._board.selectedColor === cNum;

            const item = createNode(`Swatch_${cNum}`, this._paletteContent, itemW, 162);
            item.setPosition(curX + itemW / 2, selected ? 6 : -2, 0);

            const g = item.addComponent(Graphics);
            drawRoundedBox(
                g,
                itemW,
                160,
                24,
                selected ? new Color(255, 240, 244, 255) : new Color(250, 244, 238, 255),
                selected ? THEME.primary : new Color(224, 208, 192, 255),
                selected ? 3.5 : 2,
                selected,
            );

            const wellY = 18;
            g.fillColor = new Color(238, 228, 218, 210);
            g.circle(0, wellY, 42);
            g.fill();

            g.strokeColor = new Color(220, 206, 192, 255);
            g.lineWidth = 5.5;
            g.circle(0, wellY, 42);
            g.stroke();

            if (ratio > 0) {
                g.strokeColor = isDone ? THEME.mint : THEME.primary;
                g.lineWidth = 5.5;
                const startA = Math.PI / 2;
                g.arc(0, wellY, 42, startA, startA - Math.PI * 2 * ratio, false);
                g.stroke();
            }

            const rgb = hexToRgb(this._level.colors[i]);
            const holeBg = new Color(238, 228, 218, 255);
            if (!isDone) {
                drawSingle3DBead(g, -16, wellY + 12, 13, rgb, holeBg, true);
                drawSingle3DBead(g, 15, wellY + 14, 13, rgb, holeBg, true);
                drawSingle3DBead(g, -18, wellY - 12, 13, rgb, holeBg, true);
                drawSingle3DBead(g, 16, wellY - 12, 13, rgb, holeBg, true);
            }
            drawSingle3DBead(g, 0, wellY, isDone ? 24 : 21, rgb, holeBg, true);

            const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
            const numColor = luma > 155 ? THEME.text : Color.WHITE;
            g.fillColor = new Color(rgb.r, rgb.g, rgb.b, 235);
            g.circle(0, wellY, 15);
            g.fill();
            createLabel('Num', item, isDone ? '✓' : `${cNum}`, 22, numColor, true).node.setPosition(0, wellY, 0);

            createLabel(
                'Rem',
                item,
                isDone ? t('palDone') : `${done}/${total}`,
                18,
                isDone ? THEME.mint : THEME.textSub,
                isDone,
            ).node.setPosition(0, -52, 0);

            const btn = item.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
            btn.zoomScale = 0.94;
            item.on(Button.EventType.CLICK, () => {
                AudioManager.ins.playClick();
                this._board.setSelectedColor(cNum);
                this._renderPalette();
            });

            curX += itemW + gap;
        }

        this._paletteContent.getComponent(UITransform)!.setContentSize(Math.max(730, curX + 16), 192);
    }

    private _updateSubtitle(filled: number, total: number): void {
        if (this._board.phase === 'ironing') {
            this._subtitleLabel.string = t('edSubIron');
            return;
        }
        if (this._board.phase === 'reveal') {
            this._subtitleLabel.string = t('edSubReveal');
            return;
        }
        if (this._board.phase === 'done') {
            this._subtitleLabel.string = t('edSubDone');
            return;
        }
        const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
        const rem = Math.max(0, total - filled);
        this._subtitleLabel.string = t('edSubProgress', pct, rem);
    }

    private _updateIronProgress(pct: number): void {
        this._ironPctLabel.string = t('edIronPct', pct);
        this._ironBarFill.clear();
        const fillW = Math.max(24, (560 * pct) / 100);
        this._ironBarFill.fillColor = pct >= 90 ? THEME.mint : THEME.primary;
        this._ironBarFill.roundRect(-280, -13, fillW, 26, 13);
        this._ironBarFill.fill();
    }

    private _syncPhasePanels(phase: EditorPhase): void {
        this._coloringPanel.active = phase === 'coloring';
        this._ironingPanel.active = phase === 'ironing';
        this._revealPanel.active = phase === 'reveal';
        this._donePanel.active = phase === 'done';
        this._updateSubtitle(this._board.filled.size, this._level.total);
    }

    public showToast(msg: string): void {
        this._toastLabel.string = msg;
        this._toastNode.active = true;
        this._toastNode.setSiblingIndex(this.node.children.length - 1);
        this._toastTimer = 2.0;
    }

    protected update(dt: number): void {
        if (!this._isPaused && this._board && (this._board.phase === 'coloring' || this._board.phase === 'ironing' || this._board.phase === 'reveal')) {
            this._sessionSeconds += dt;
        }
        if (this._toastTimer > 0) {
            this._toastTimer -= dt;
            if (this._toastTimer <= 0) {
                this._toastNode.active = false;
            }
        }
    }
}
