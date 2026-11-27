import { _decorator, Component, Graphics, Node, ResolutionPolicy, screen, Sprite, sys, UITransform, view } from 'cc';
import { AdManager } from './core/AdManager';
import { AudioManager } from './core/AudioManager';
import { LevelManager } from './core/LevelManager';
import { ResManager } from './core/ResManager';
import { SaveManager } from './core/SaveManager';
import { LevelData } from './core/Types';
import { EditorView } from './ui/EditorView';
import { showRewardedAdOverlay } from './ui/HomeModals';
import { HomeView } from './ui/HomeView';
import { buildChallengePage, buildLeaderboardPage, buildMyWorksPage } from './ui/PagesView';
import { THEME, addFullStretchWidget, createNode } from './ui/UIHelper';

const { ccclass } = _decorator;

export interface LayoutMetrics {
    canvasW: number;
    canvasH: number;
    topInset: number;
    bottomInset: number;
}

@ccclass('PindouApp')
export class PindouApp extends Component {
    private _home!: HomeView;
    private _editor!: EditorView;
    private _editorInited = false;
    private _lbPage: { node: Node; refresh: () => void } | null = null;
    private _worksPage: { node: Node; refresh: () => void } | null = null;
    private _challengePage: { node: Node; refresh: () => void } | null = null;
    private _metrics!: LayoutMetrics;

    protected async start(): Promise<void> {
        this._configureResponsiveResolution();
        this._metrics = this._computeMetrics();

        const rootUi = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        rootUi.setContentSize(this._metrics.canvasW, this._metrics.canvasH);
        addFullStretchWidget(this.node);

        // Warm craft-table backdrop covering full visible height edge-to-edge
        const bgNode = createNode('Backdrop', this.node, this._metrics.canvasW, this._metrics.canvasH);
        addFullStretchWidget(bgNode);
        const bgGfx = bgNode.addComponent(Graphics);
        bgGfx.fillColor = THEME.bg;
        bgGfx.rect(-this._metrics.canvasW / 2, -this._metrics.canvasH / 2, this._metrics.canvasW, this._metrics.canvasH);
        bgGfx.fill();

        SaveManager.ins.load();
        AudioManager.ins.init(this.node);

        await Promise.all([
            ResManager.ins.loadAll(),
            LevelManager.ins.loadAll(),
            AudioManager.ins.loadAll(),
        ]);

        const deskSf = ResManager.ins.getTexture('desk_bg');
        if (deskSf) {
            const deskNode = createNode('DeskSprite', bgNode, this._metrics.canvasW, this._metrics.canvasH);
            addFullStretchWidget(deskNode);
            const sp = deskNode.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = deskSf;
        }

        // Home Hub View
        const homeNode = createNode('HomeView', this.node, this._metrics.canvasW, this._metrics.canvasH);
        this._home = homeNode.addComponent(HomeView);
        this._home.init(this._metrics, {
            onStartLevel: (level: LevelData) => this._openEditor(level),
            onOpenLeaderboard: () => this._openLeaderboardPage(),
            onOpenWorks: () => this._openWorksPage(),
            onOpenChallenge: () => this._openChallengePage(),
        });

        // Editor View (lazily initialized when active=true)
        const editorNode = createNode('EditorView', this.node, this._metrics.canvasW, this._metrics.canvasH);
        this._editor = editorNode.addComponent(EditorView);
        editorNode.active = false;

        // Global Topmost Host for Rewarded Video Ad Overlays
        const adHost = createNode('AdOverlayHost', this.node, this._metrics.canvasW, this._metrics.canvasH);
        addFullStretchWidget(adHost);
        AdManager.ins.setOverlayPresenter((meta, onDone) => {
            showRewardedAdOverlay(adHost, this._metrics, meta, onDone);
        });
    }

    private _configureResponsiveResolution(): void {
        try {
            const win = screen.windowSize;
            if (win.width > 0 && win.height > 0) {
                const aspect = win.width / win.height;
                const designAspect = 750 / 1334;
                if (aspect < designAspect - 0.01) {
                    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
                } else {
                    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.SHOW_ALL);
                }
            }
        } catch {
            // Fallback to project default
        }
    }

    private _computeMetrics(): LayoutMetrics {
        const vis = view.getVisibleSize();
        const canvasW = Math.round(vis.width) || 750;
        const canvasH = Math.round(vis.height) || 1334;
        let topInset = 0;
        let bottomInset = 0;
        try {
            const safe = sys.getSafeAreaRect();
            if (vis.height > 0 && safe.height > 0 && safe.height < vis.height) {
                const topRaw = Math.max(0, vis.height - (safe.y + safe.height));
                const botRaw = Math.max(0, safe.y);
                topInset = Math.min(96, Math.round(topRaw));
                bottomInset = Math.min(64, Math.round(botRaw));
            }
        } catch {
            // Browser without notch
        }
        return { canvasW, canvasH, topInset, bottomInset };
    }

    private _hideAllViews(): void {
        this._home.node.active = false;
        this._editor.node.active = false;
        if (this._lbPage) this._lbPage.node.active = false;
        if (this._worksPage) this._worksPage.node.active = false;
        if (this._challengePage) this._challengePage.node.active = false;
    }

    private _showHome(): void {
        this._hideAllViews();
        this._home.node.active = true;
        this._home.refresh();
    }

    private _openLeaderboardPage(): void {
        this._hideAllViews();
        if (!this._lbPage) {
            this._lbPage = buildLeaderboardPage(
                this._metrics,
                () => this._showHome(),
                () => {
                    const lv = LevelManager.ins.getCurrentMainStage();
                    if (lv) this._openEditor(lv);
                    else this._showHome();
                },
            );
            this._lbPage.node.setParent(this.node);
            // Keep AdOverlayHost as topmost child
            this.node.getChildByName('AdOverlayHost')?.setSiblingIndex(this.node.children.length - 1);
        }
        this._lbPage.node.active = true;
        this._lbPage.refresh();
    }

    private _openWorksPage(): void {
        this._hideAllViews();
        if (!this._worksPage) {
            this._worksPage = buildMyWorksPage(
                this._metrics,
                () => this._showHome(),
                (lv) => this._openEditor(lv),
                () => this._openChallengePage(),
            );
            this._worksPage.node.setParent(this.node);
            this.node.getChildByName('AdOverlayHost')?.setSiblingIndex(this.node.children.length - 1);
        }
        this._worksPage.node.active = true;
        this._worksPage.refresh();
    }

    private _openChallengePage(): void {
        this._hideAllViews();
        if (!this._challengePage) {
            this._challengePage = buildChallengePage(
                this._metrics,
                () => this._showHome(),
                (lv) => this._openEditor(lv),
                (msg) => {
                    this._showHome();
                    this._home.showToast(msg);
                },
            );
            this._challengePage.node.setParent(this.node);
            this.node.getChildByName('AdOverlayHost')?.setSiblingIndex(this.node.children.length - 1);
        }
        this._challengePage.node.active = true;
        this._challengePage.refresh();
    }

    private _openEditor(level: LevelData): void {
        this._hideAllViews();
        this._editor.node.active = true;
        if (!this._editorInited) {
            this._editorInited = true;
            this._editor.init(
                this._metrics,
                () => this._showHome(),
                (nextLv: LevelData) => this._openEditor(nextLv),
            );
        }
        this._editor.openLevel(level);
    }
}
