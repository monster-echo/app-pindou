import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Mask,
    Node,
    UITransform,
    Vec3,
} from 'cc';
import { AudioManager } from '../core/AudioManager';
import { levelName, t } from '../core/I18n';
import { LevelManager } from '../core/LevelManager';
import { SaveManager } from '../core/SaveManager';
import { LevelData, difficultyStars, hexToRgb } from '../core/Types';
import type { LayoutMetrics } from '../PindouApp';
import {
    showAdSupplyModal,
    showSettingsModal,
} from './HomeModals';
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

export interface HomeCallbacks {
    onStartLevel: (level: LevelData) => void;
    onOpenLeaderboard: () => void;
    onOpenWorks: () => void;
    onOpenChallenge: () => void;
}

@ccclass('HomeView')
export class HomeView extends Component {
    private _metrics!: LayoutMetrics;
    private _callbacks!: HomeCallbacks;

    private _coinCapsuleNode!: Node;
    private _coinLabel!: Label;
    private _displayedCoins = -1;
    private _animCoins = -1;
    private _stageBadgeLabel!: Label;
    private _levelTitleLabel!: Label;
    private _boardPreviewGfx!: Graphics;
    private _progressFillMask!: UITransform;
    private _progressTextLabel!: Label;
    private _playBtnLabel!: Label;
    private _worksSubLabel!: Label;
    private _adSubLabel!: Label;
    private _ranksSubLabel!: Label;
    private _shareSubLabel!: Label;
    private _modalHost!: Node;
    private _toastNode!: Node;
    private _toastLabel!: Label;
    private _toastTimer = 0;

    public init(metrics: LayoutMetrics, callbacks: HomeCallbacks): void {
        this._metrics = metrics;
        this._callbacks = callbacks;
        const ui = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        ui.setContentSize(metrics.canvasW, metrics.canvasH);
        addFullStretchWidget(this.node);

        this._buildTopBar();
        this._buildCenterBoardStage();
        this._buildSideHubDocks();
        this._buildBottomPlaySection();
        this._buildToast();

        this._modalHost = createNode('ModalHost', this.node, metrics.canvasW, metrics.canvasH);
        this.refresh();
    }

    private _buildTopBar(): void {
        const { canvasH, topInset } = this._metrics;
        const barY = canvasH / 2 - topInset - 54;

        // Left: Settings circular button (Sound & Language inside)
        const setBtn = createNode('SettingsBtn', this.node, 66, 66);
        setBtn.setPosition(-304, barY, 0);
        createUiSprite('Bg', setBtn, 'btn_circle_cream', 80, 80)?.node.setPosition(0, -2, 0);
        createIconSprite('SetIc', setBtn, 'icon_settings', 34);
        const sb = setBtn.addComponent(Button);
        sb.transition = Button.Transition.SCALE;
        sb.zoomScale = 0.92;
        setBtn.on(Button.EventType.CLICK, () => {
            AudioManager.ins.playClick();
            showSettingsModal(
                this._modalHost,
                this._metrics,
                () => this.refresh(),
                () => this.refresh(),
            );
        });

        // Right: Coins capsule
        const coinBox = createNode('CoinCapsule', this.node, 196, 56);
        coinBox.setPosition(242, barY, 0);
        this._coinCapsuleNode = coinBox;
        createUiSprite('Bg', coinBox, 'badge_white', 212, 68)?.node.setPosition(0, -2, 0);
        const coinIc = createIconSprite('CoinIc', coinBox, 'icon_coin', 32);
        if (coinIc) coinIc.node.setPosition(-56, 1, 0);
        this._coinLabel = createLabel('Coins', coinBox, '120', 25, new Color(168, 96, 12, 255), true, 108, 36);
        this._coinLabel.node.setPosition(18, 1, 0);
    }

    private _buildCenterBoardStage(): void {
        const { canvasH, topInset } = this._metrics;
        const centerY = canvasH * 0.105 - topInset * 0.14;

        // Stage badge header above wooden board
        const badge = createNode('StageBadge', this.node, 336, 50);
        badge.setPosition(0, centerY + 324, 0);
        createUiSprite('Bg', badge, 'badge_white', 354, 62)?.node.setPosition(0, -2, 0);
        const decBead = createNode('BeadMark', badge, 26, 26);
        decBead.setPosition(-130, 1, 0);
        drawSingle3DBead(decBead.addComponent(Graphics), 0, 0, 10, hexToRgb('#FF6B8B'), THEME.bg, false);
        this._stageBadgeLabel = createLabel('Lbl', badge, '', 21, THEME.primaryDark, true, 246, 34);
        this._stageBadgeLabel.node.setPosition(16, 1, 0);

        this._levelTitleLabel = createLabel('LevelTitle', this.node, '', 38, THEME.text, true, 640, 52);
        this._levelTitleLabel.node.setPosition(0, centerY + 252, 0);

        // Oak wooden framed pegboard centerpiece (HD PNG sprite!)
        const frameSize = 440;
        const woodFrame = createNode('WoodPegFrame', this.node, frameSize, frameSize);
        woodFrame.setPosition(0, centerY - 22, 0);
        createUiSprite('FrameSprite', woodFrame, 'wood_frame_hd', frameSize + 40, frameSize + 40);

        const boardInner = createNode('BoardPreview', woodFrame, 386, 386);
        this._boardPreviewGfx = boardInner.addComponent(Graphics);

        const boardBtn = woodFrame.addComponent(Button);
        boardBtn.transition = Button.Transition.SCALE;
        boardBtn.zoomScale = 0.98;
        woodFrame.on(Button.EventType.CLICK, () => this._handleStartCurrentStage());

        // Glossy completion bar directly beneath wooden frame
        const barW = 448;
        const barH = 38;
        const barWrap = createNode('ProgressBarWrap', this.node, barW, barH);
        barWrap.setPosition(0, centerY - 274, 0);
        createUiSprite('TrackBg', barWrap, 'progress_track', barW + 22, barH + 18)?.node.setPosition(0, -2, 0);

        const fillMask = createNode('FillMask', barWrap, barW, barH);
        const maskUi = fillMask.getComponent(UITransform)!;
        maskUi.setAnchorPoint(0, 0.5);
        fillMask.setPosition(-barW / 2, 0, 0);
        fillMask.addComponent(Mask);
        this._progressFillMask = maskUi;

        const fillImg = createUiSprite('FillSprite', fillMask, 'progress_fill', barW + 10, barH + 6);
        if (fillImg) {
            fillImg.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
            fillImg.node.setPosition(-5, -1, 0);
        }

        this._progressTextLabel = createLabel('PctText', barWrap, '', 20, Color.WHITE, true, 320, 32);
        this._progressTextLabel.enableOutline = true;
        this._progressTextLabel.outlineColor = new Color(68, 42, 28, 230);
        this._progressTextLabel.outlineWidth = 2;
        this._progressTextLabel.node.setPosition(0, 1, 0);
    }

    /** Hub tile with generous breathing space (10px clear gap between jewel square & pill label). */
    private _createHubTile(
        name: string,
        x: number,
        y: number,
        iconKey: string,
        tileUiKey: string,
        title: string,
        onClick: () => void,
    ): Label {
        const tile = createNode(name, this.node, 136, 146);
        tile.setPosition(x, y, 0);

        const box = createNode('IconBox', tile, 90, 90);
        box.setPosition(0, 26, 0);
        createUiSprite('TileBg', box, tileUiKey, 104, 104)?.node.setPosition(0, -2, 0);
        createIconSprite('Icon', box, iconKey, 50)?.node.setPosition(0, 2, 0);

        const pill = createNode('LblBg', tile, 134, 36);
        pill.setPosition(0, -44, 0);
        createUiSprite('LblSprite', pill, 'badge_white', 146, 46)?.node.setPosition(0, -1, 0);
        const lbl = createLabel('Lbl', pill, title, 18, THEME.text, true, 114, 28);
        lbl.node.setPosition(0, 1, 0);

        const btn = tile.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.93;
        tile.on(Button.EventType.CLICK, onClick);
        return lbl;
    }

    private _buildSideHubDocks(): void {
        const { canvasH, bottomInset } = this._metrics;
        const dockBaseY = -canvasH / 2 + bottomInset + 224;

        // Left column: My Works + Booster Supply (162px center-to-center -> wide gap!)
        this._worksSubLabel = this._createHubTile(
            'MyWorksTile',
            -272,
            dockBaseY + 112,
            'icon_gallery',
            'hub_tile_mint',
            t('myWorks'),
            () => {
                AudioManager.ins.playClick();
                this._callbacks.onOpenWorks();
            },
        );

        this._adSubLabel = this._createHubTile(
            'AdSupplyTile',
            -272,
            dockBaseY - 52,
            'icon_ad',
            'hub_tile_pink',
            t('freeItems'),
            () => {
                AudioManager.ins.playClick();
                this._openAdSupply();
            },
        );

        // Right column: Leaderboard + Share
        this._ranksSubLabel = this._createHubTile(
            'LeaderboardTile',
            272,
            dockBaseY + 112,
            'icon_trophy',
            'hub_tile_gold',
            t('leaderboard'),
            () => {
                AudioManager.ins.playClick();
                this._callbacks.onOpenLeaderboard();
            },
        );

        this._shareSubLabel = this._createHubTile(
            'ShareTile',
            272,
            dockBaseY - 52,
            'icon_share',
            'hub_tile_green',
            t('shareBonus'),
            () => {
                AudioManager.ins.playClick();
                const gained = SaveManager.ins.claimDailyShareReward();
                if (gained > 0) {
                    playCoinBurstEffect(
                        this.node,
                        new Vec3(272, dockBaseY - 52, 0),
                        this._coinCapsuleNode.position,
                        gained,
                        this._coinCapsuleNode,
                        7,
                        true,
                    );
                    this.refresh();
                } else {
                    this.showToast(t('shareLimitToast'));
                }
            },
        );
    }

    private _buildBottomPlaySection(): void {
        const { canvasH, bottomInset } = this._metrics;
        const baseY = -canvasH / 2 + bottomInset + 128;

        // Hero Start/Continue Button ("开始拼豆" / "Play Stage")
        const playBtn = createNode('HeroPlayBtn', this.node, 372, 102);
        playBtn.setPosition(0, baseY + 28, 0);
        createUiSprite('PlayBg', playBtn, 'btn_hero_gold', 396, 122)?.node.setPosition(0, -3, 0);

        const playBead = createNode('PlayBead', playBtn, 46, 46);
        playBead.setPosition(-126, 4, 0);
        drawSingle3DBead(playBead.addComponent(Graphics), 0, 0, 18, hexToRgb('#FF5C8D'), THEME.accent, true);

        this._playBtnLabel = createLabel('PlayTxt', playBtn, t('playStart'), 34, Color.WHITE, true, 240, 46);
        this._playBtnLabel.enableOutline = true;
        this._playBtnLabel.outlineColor = new Color(142, 62, 10, 240);
        this._playBtnLabel.outlineWidth = 3;
        this._playBtnLabel.node.setPosition(22, 2, 0);

        const pb = playBtn.addComponent(Button);
        pb.transition = Button.Transition.SCALE;
        pb.zoomScale = 0.94;
        playBtn.on(Button.EventType.CLICK, () => this._handleStartCurrentStage());
    }

    private _handleStartCurrentStage(): void {
        AudioManager.ins.playClick();
        const lv = LevelManager.ins.getCurrentMainStage();
        if (lv) {
            this._callbacks.onStartLevel(lv);
        }
    }

    private _openAdSupply(): void {
        let prevCoins = SaveManager.ins.coins;
        const syncWithBurst = () => {
            const nowCoins = SaveManager.ins.coins;
            if (nowCoins > prevCoins) {
                playCoinBurstEffect(
                    this.node,
                    new Vec3(0, 0, 0),
                    this._coinCapsuleNode.position,
                    nowCoins - prevCoins,
                    this._coinCapsuleNode,
                    8,
                    true,
                );
            }
            prevCoins = nowCoins;
            this.refresh();
        };
        showAdSupplyModal(
            this._modalHost,
            this._metrics,
            (msg) => this.showToast(msg),
            syncWithBurst,
            syncWithBurst,
        );
    }

    private _buildToast(): void {
        const { canvasH, topInset } = this._metrics;
        this._toastNode = createNode('HomeToast', this.node, 560, 62);
        this._toastNode.setPosition(0, canvasH / 2 - topInset - 122, 0);
        drawRoundedBox(this._toastNode.addComponent(Graphics), 560, 62, 31, new Color(56, 38, 30, 232));
        this._toastLabel = createLabel('Lbl', this._toastNode, '', 22, Color.WHITE, false, 520, 38);
        this._toastNode.active = false;
    }

    public showToast(msg: string): void {
        this._toastLabel.string = msg;
        this._toastNode.active = true;
        this._toastNode.setSiblingIndex(this.node.children.length - 1);
        this._toastTimer = 2.2;
    }

    public refresh(): void {
        const targetCoins = SaveManager.ins.coins;
        if (this._displayedCoins < 0) {
            this._displayedCoins = targetCoins;
            this._animCoins = targetCoins;
            this._coinLabel.string = `${targetCoins}`;
        } else if (targetCoins !== this._displayedCoins) {
            if (targetCoins > this._displayedCoins && !this.node.getChildByName('CoinBurstFX')) {
                const gained = targetCoins - this._displayedCoins;
                playCoinBurstEffect(
                    this.node,
                    new Vec3(0, 0, 0),
                    this._coinCapsuleNode.position,
                    gained,
                    this._coinCapsuleNode,
                    gained >= 120 ? 15 : 10,
                    true,
                );
            }
            this._displayedCoins = targetCoins;
        }

        if (this._ranksSubLabel) this._ranksSubLabel.string = t('leaderboard');
        if (this._shareSubLabel) this._shareSubLabel.string = t('shareBonus');

        const lv = LevelManager.ins.getCurrentMainStage();
        const completedCount = LevelManager.ins.getCompletedWorks().length;
        if (this._worksSubLabel) {
            this._worksSubLabel.string = completedCount > 0 ? t('worksCount', completedCount) : t('myWorks');
        }
        if (this._adSubLabel) {
            const totalCharges = SaveManager.ins.floodCharges + SaveManager.ins.magicCharges;
            this._adSubLabel.string = t('itemsCount', totalCharges);
        }

        if (!lv) return;
        const save = SaveManager.ins.getLevelSave(lv.id);
        const done = SaveManager.ins.isCompleted(lv);
        const pct = done ? 100 : lv.total > 0 ? Math.min(99, Math.round((save.filled.length / lv.total) * 100)) : 0;

        const stars = difficultyStars(lv.difficulty);
        this._stageBadgeLabel.string = lv.stage === 1
            ? t('stageWarmup', lv.stage, stars)
            : t('stagePro', lv.stage, stars);
        this._levelTitleLabel.string = levelName(lv);

        drawLevelThumbnail(this._boardPreviewGfx, lv, 386, new Set(save.filled), done, true);

        const barW = 448;
        const barH = 38;
        this._progressFillMask.setContentSize(pct > 0 ? Math.max(barH, (barW * pct) / 100) : 0, barH);
        this._progressTextLabel.string = t('completionPct', pct);

        if (done) {
            this._playBtnLabel.string = t('playReplay');
        } else if (save.filled.length > 0) {
            this._playBtnLabel.string = t('playContinue', lv.stage);
        } else {
            this._playBtnLabel.string = t('playStart');
        }
    }

    protected update(dt: number): void {
        if (this._displayedCoins >= 0 && Math.abs(this._animCoins - this._displayedCoins) > 0.5) {
            const diff = this._displayedCoins - this._animCoins;
            const step = diff * Math.min(1, dt * 10);
            this._animCoins = Math.abs(diff) < 1.2 ? this._displayedCoins : this._animCoins + step;
            this._coinLabel.string = `${Math.round(this._animCoins)}`;
        } else if (this._displayedCoins >= 0 && this._animCoins !== this._displayedCoins) {
            this._animCoins = this._displayedCoins;
            this._coinLabel.string = `${this._displayedCoins}`;
        }
        if (this._toastTimer > 0) {
            this._toastTimer -= dt;
            if (this._toastTimer <= 0) {
                this._toastNode.active = false;
            }
        }
    }
}
