import { Button, Color, Graphics, Label, Mask, Node, ScrollView, UITransform } from 'cc';
import { AdManager } from '../core/AdManager';
import { levelName, t } from '../core/I18n';
import { LeaderboardManager, LeaderboardTab, formatDuration } from '../core/LeaderboardManager';
import { LevelManager } from '../core/LevelManager';
import { SaveManager } from '../core/SaveManager';
import { ECONOMY, LevelData, difficultyStars, requiredStageForChallengeIndex } from '../core/Types';
import type { LayoutMetrics } from '../PindouApp';
import { AudioManager } from '../core/AudioManager';
import {
    THEME,
    addFullStretchWidget,
    createIconSprite,
    createLabel,
    createLeftLabel,
    createNode,
    createPillButton,
    createUiSprite,
    drawLevelThumbnail,
    drawRoundedBox,
} from './UIHelper';

function buildPageHeader(
    parent: Node,
    metrics: LayoutMetrics,
    iconKey: string,
    titleText: string,
    onBack: () => void,
): { titleLbl: Label; headerH: number } {
    const headerH = 122 + metrics.topInset;
    const bar = createNode('PageHeader', parent, 750, headerH);
    bar.setPosition(0, metrics.canvasH / 2 - headerH / 2, 0);

    const bg = bar.addComponent(Graphics);
    bg.fillColor = new Color(255, 252, 248, 242);
    bg.rect(-375, -headerH / 2, 750, headerH);
    bg.fill();
    bg.fillColor = new Color(235, 218, 200, 220);
    bg.rect(-375, -headerH / 2, 750, 2);
    bg.fill();

    const cy = -metrics.topInset / 2;
    const backBtn = createPillButton(
        'BackBtn',
        bar,
        '',
        56,
        54,
        THEME.bg,
        THEME.text,
        () => {
            AudioManager.ins.playClick();
            onBack();
        },
        21,
        THEME.cardBorder,
        'icon_back',
        26,
        'btn_cream',
    );
    backBtn.setPosition(-314, cy - 2, 0);

    const ic = createIconSprite('HeaderIc', bar, iconKey, 40);
    if (ic) ic.node.setPosition(-146, cy - 2, 0);
    const titleLbl = createLabel('HeaderTitle', bar, titleText, 29, THEME.text, true, 300, 42);
    titleLbl.node.setPosition(6, cy - 2, 0);

    return { titleLbl, headerH };
}

/** Full-Screen spacious Leaderboard Page (`750 x canvasH`) */
export function buildLeaderboardPage(
    metrics: LayoutMetrics,
    onBackHome: () => void,
    onContinuePlay: () => void,
): { node: Node; refresh: () => void } {
    const root = new Node('LeaderboardPage');
    root.addComponent(UITransform).setContentSize(metrics.canvasW, metrics.canvasH);
    addFullStretchWidget(root);

    const { titleLbl, headerH } = buildPageHeader(root, metrics, 'icon_trophy', t('lbTitle'), onBackHome);

    let activeTab: LeaderboardTab = 'stages';
    const topContentY = metrics.canvasH / 2 - headerH;

    const tabRow = createNode('Tabs', root, 700, 68);
    tabRow.setPosition(0, topContentY - 52, 0);

    const gapBox = createNode('GapHint', root, 692, 54);
    gapBox.setPosition(0, topContentY - 122, 0);
    createUiSprite('GapBg', gapBox, 'badge_white', 704, 62);
    const gapLbl = createLabel('Lbl', gapBox, '', 21, THEME.primaryDark, true, 640, 36);

    const footerH = 198 + metrics.bottomInset;
    const listTopY = topContentY - 164;
    const listBotY = -metrics.canvasH / 2 + footerH;
    const listH = Math.max(420, listTopY - listBotY);
    const listCenterY = (listTopY + listBotY) / 2;

    const viewBox = createNode('ListWrap', root, 710, listH);
    viewBox.setPosition(0, listCenterY, 0);
    const maskNode = createNode('Mask', viewBox, 710, listH);
    maskNode.addComponent(Mask);
    const content = createNode('Content', maskNode, 710, listH);
    content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    content.setPosition(0, listH / 2, 0);
    const sv = viewBox.addComponent(ScrollView);
    sv.content = content;
    sv.vertical = true;
    sv.horizontal = false;
    sv.elastic = true;

    // Spacious Footer Dock (Self Rank Card + Play CTA)
    const footerDock = createNode('FooterDock', root, 750, footerH);
    footerDock.setPosition(0, -metrics.canvasH / 2 + footerH / 2, 0);
    const fg = footerDock.addComponent(Graphics);
    fg.fillColor = new Color(255, 252, 248, 245);
    fg.rect(-375, -footerH / 2, 750, footerH);
    fg.fill();
    fg.fillColor = new Color(235, 218, 200, 220);
    fg.rect(-375, footerH / 2 - 2, 750, 2);
    fg.fill();

    const fInnerY = metrics.bottomInset / 2;
    const selfBar = createNode('SelfBar', footerDock, 696, 86);
    selfBar.setPosition(0, fInnerY + 42, 0);

    const ctaBtn = createPillButton(
        'GoPlayBtn',
        footerDock,
        t('lbGoPlay'),
        336,
        66,
        THEME.primary,
        Color.WHITE,
        () => {
            AudioManager.ins.playClick();
            onContinuePlay();
        },
        24,
        undefined,
        undefined,
        0,
        'btn_pink',
    );
    ctaBtn.setPosition(0, fInnerY - 46, 0);
    const ctaLbl = ctaBtn.getChildByName('Label')!.getComponent(Label)!;

    const refresh = () => {
        titleLbl.string = t('lbTitle');
        ctaLbl.string = t('lbGoPlay');

        tabRow.removeAllChildren();
        const tabs: { id: LeaderboardTab; label: string }[] = [
            { id: 'stages', label: t('lbTabStages') },
            { id: 'beads', label: t('lbTabBeads') },
            { id: 'speed', label: t('lbTabSpeed') },
        ];
        tabs.forEach((tMeta, i) => {
            const sel = activeTab === tMeta.id;
            createPillButton(
                `Tab_${tMeta.id}`,
                tabRow,
                tMeta.label,
                218,
                56,
                sel ? THEME.primary : THEME.bg,
                sel ? Color.WHITE : THEME.text,
                () => {
                    AudioManager.ins.playClick();
                    activeTab = tMeta.id;
                    refresh();
                },
                21,
                undefined,
                undefined,
                0,
                sel ? 'btn_pink' : 'btn_cream',
            ).setPosition(-232 + i * 232, 0, 0);
        });

        const { list, selfEntry, gapText } = LeaderboardManager.ins.getEntries(activeTab);
        gapLbl.string = gapText;

        content.removeAllChildren();
        const rowH = 92;
        const gap = 12;
        let curY = -10;

        for (const e of list) {
            const row = createNode(`Row_${e.rank}`, content, 692, rowH);
            row.setPosition(0, curY - rowH / 2, 0);
            const rowBg = createUiSprite('RowBg', row, 'card_row', 702, rowH + 10);
            if (rowBg && e.isSelf) {
                rowBg.color = new Color(255, 240, 245, 255);
            }

            const rankColor = e.rank === 1 ? THEME.gold : e.rank === 2 ? new Color(128, 142, 162, 255) : e.rank === 3 ? new Color(196, 118, 48, 255) : THEME.textSub;
            createLabel('Rank', row, `${e.rank}`, 29, rankColor, true, 64, 40).node.setPosition(-298, 2, 0);

            const av = createNode('Avatar', row, 56, 56);
            av.setPosition(-232, 2, 0);
            const ag = av.addComponent(Graphics);
            const hx = e.avatarColor.replace('#', '');
            const ac = new Color(parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16), 255);
            ag.fillColor = ac;
            ag.circle(0, 0, 26);
            ag.fill();
            createLabel('AvTxt', av, e.name.slice(0, 1), 23, Color.WHITE, true);

            createLeftLabel('Name', row, `${e.name}${e.isSelf ? t('lbSelfSuffix') : ''}`, -188, 16, 320, 32, 23, THEME.text, true);
            createLeftLabel('Title', row, e.title, -188, -16, 320, 26, 18, THEME.textSub, false);

            const valTxt = activeTab === 'stages'
                ? t('lbStagesUnit', e.stagesCleared)
                : activeTab === 'beads'
                    ? t('lbBeadsUnit', e.totalBeads)
                    : formatDuration(e.bestSeconds);
            const valLbl = createLabel('Val', row, valTxt, 24, THEME.primaryDark, true, 166, 34);
            valLbl.horizontalAlign = Label.HorizontalAlign.RIGHT;
            valLbl.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
            valLbl.node.setPosition(314, 2, 0);

            curY -= rowH + gap;
        }
        content.getComponent(UITransform)!.setContentSize(710, Math.max(listH, Math.abs(curY) + 18));
        sv.scrollToTop(0.05);

        selfBar.removeAllChildren();
        const sbSp = createUiSprite('SelfBg', selfBar, 'card_row', 706, 94);
        if (sbSp) sbSp.color = new Color(255, 236, 194, 255);
        createLeftLabel('MyRank', selfBar, t('lbRankFmt', selfEntry.rank), -312, 2, 134, 38, 25, new Color(168, 86, 12, 255), true);
        createLabel('MyName', selfBar, `${selfEntry.name} · ${t('lbStagesUnit', selfEntry.stagesCleared)}`, 22, THEME.text, true, 270, 34).node.setPosition(-12, 2, 0);
        const myMetric = activeTab === 'stages'
            ? t('lbStagesUnit', selfEntry.stagesCleared)
            : activeTab === 'beads'
                ? t('lbBeadsUnit', selfEntry.totalBeads)
                : formatDuration(selfEntry.bestSeconds);
        const mv = createLabel('MyVal', selfBar, myMetric, 25, THEME.primaryDark, true, 156, 36);
        mv.horizontalAlign = Label.HorizontalAlign.RIGHT;
        mv.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
        mv.node.setPosition(314, 2, 0);
    };

    return { node: root, refresh };
}

/** Full-Screen spacious My Works Gallery Page (`750 x canvasH`) */
export function buildMyWorksPage(
    metrics: LayoutMetrics,
    onBackHome: () => void,
    onInspectWork: (lv: LevelData) => void,
    onOpenChallenge?: () => void,
): { node: Node; refresh: () => void } {
    const root = new Node('MyWorksPage');
    root.addComponent(UITransform).setContentSize(metrics.canvasW, metrics.canvasH);
    addFullStretchWidget(root);

    const { titleLbl, headerH } = buildPageHeader(root, metrics, 'icon_gallery', t('worksTitle'), onBackHome);
    const topContentY = metrics.canvasH / 2 - headerH;

    let chBtnLbl: Label | null = null;
    if (onOpenChallenge) {
        const headerBar = root.getChildByName('PageHeader');
        if (headerBar) {
            const chBtn = createPillButton(
                'HeaderChallengeBtn',
                headerBar,
                t('worksChallengeBtn'),
                148,
                50,
                new Color(148, 92, 246, 255),
                Color.WHITE,
                () => {
                    AudioManager.ins.playClick();
                    onOpenChallenge();
                },
                19,
                undefined,
                'icon_challenge',
                22,
                'btn_purple',
            );
            chBtn.setPosition(276, -metrics.topInset / 2 - 2, 0);
            chBtnLbl = chBtn.getChildByName('Label')?.getComponent(Label) || null;
        }
    }

    const sumBadge = createNode('SummaryBadge', root, 692, 52);
    sumBadge.setPosition(0, topContentY - 40, 0);
    createUiSprite('Bg', sumBadge, 'badge_white', 704, 60);
    const sumLbl = createLabel('Lbl', sumBadge, '', 20, THEME.textSub, true, 640, 34);

    const gridTopY = topContentY - 80;
    const gridBotY = -metrics.canvasH / 2 + metrics.bottomInset + 20;
    const gridH = Math.max(520, gridTopY - gridBotY);

    const wrap = createNode('WorksWrap', root, 712, gridH);
    wrap.setPosition(0, (gridTopY + gridBotY) / 2, 0);
    const mask = createNode('Mask', wrap, 712, gridH);
    mask.addComponent(Mask);
    const content = createNode('Content', mask, 712, gridH);
    content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    content.setPosition(0, gridH / 2, 0);
    const sv = wrap.addComponent(ScrollView);
    sv.content = content;
    sv.vertical = true;
    sv.horizontal = false;
    sv.elastic = true;

    const refresh = () => {
        titleLbl.string = t('worksTitle');
        if (chBtnLbl) chBtnLbl.string = t('worksChallengeBtn');

        const mains = LevelManager.ins.mainLevels;
        const completed = LevelManager.ins.getCompletedWorks();
        sumLbl.string = t('worksSummary', completed.length);

        content.removeAllChildren();
        const colW = 332;
        const colH = 352;
        const gap = 20;
        const currentStage = LevelManager.ins.getCurrentMainStage();

        mains.forEach((lv, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const cx = col === 0 ? -(colW / 2 + gap / 2) : (colW / 2 + gap / 2);
            const cy = -row * (colH + gap) - colH / 2 - 12;

            const save = SaveManager.ins.getLevelSave(lv.id);
            const isDone = SaveManager.ins.isCompleted(lv);
            const isCurr = currentStage?.id === lv.id;

            const tile = createNode(`StageCard_${lv.id}`, content, colW, colH);
            tile.setPosition(cx, cy, 0);
            createUiSprite('TileBg', tile, 'panel_card', colW + 18, colH + 18);

            const prevNode = createNode('Prev', tile, 226, 226);
            prevNode.setPosition(0, 38, 0);
            const pg = prevNode.addComponent(Graphics);
            if (isDone || isCurr) {
                drawLevelThumbnail(pg, lv, 224, new Set(save.filled), isDone, isDone);
            } else {
                drawLevelThumbnail(pg, lv, 224, null, false, false);
            }

            createLabel('StageTitle', tile, t('worksCardTitle', lv.stage, levelName(lv)), 21, THEME.text, true, 296, 30).node.setPosition(0, -96, 0);
            createLabel(
                'StageSpec',
                tile,
                `${difficultyStars(lv.difficulty)} · ${lv.width}×${lv.height} · ${lv.total}豆`,
                15,
                THEME.primaryDark,
                false,
                296,
                22,
            ).node.setPosition(0, -122, 0);

            const statusTxt = isDone
                ? t('worksDoneStatus', formatDuration(save.bestSeconds || 0))
                : isCurr
                    ? t('worksCurrStatus', Math.round((save.filled.length / lv.total) * 100))
                    : t('worksLockStatus', lv.stage - 1);
            const statusCol = isDone ? THEME.mint : isCurr ? THEME.primary : THEME.textSub;
            createLabel('Status', tile, statusTxt, 17, statusCol, isDone || isCurr, 296, 26).node.setPosition(0, -148, 0);

            if (isDone) {
                const btn = tile.addComponent(Button);
                btn.transition = Button.Transition.SCALE;
                btn.zoomScale = 0.96;
                tile.on(Button.EventType.CLICK, () => {
                    AudioManager.ins.playClick();
                    onInspectWork(lv);
                });
            }
        });

        const rowsTotal = Math.ceil(mains.length / 2);
        content.getComponent(UITransform)!.setContentSize(712, Math.max(gridH, rowsTotal * (colH + gap) + 24));
        sv.scrollToTop(0.05);
    };

    return { node: root, refresh };
}

/** Full-Screen spacious Limited Pro Challenge Page (`750 x canvasH`) */
export function buildChallengePage(
    metrics: LayoutMetrics,
    onBackHome: () => void,
    onStartLevel: (lv: LevelData) => void,
    onToastHome: (msg: string) => void,
): { node: Node; refresh: () => void } {
    const root = new Node('ChallengePage');
    root.addComponent(UITransform).setContentSize(metrics.canvasW, metrics.canvasH);
    addFullStretchWidget(root);

    const { titleLbl, headerH } = buildPageHeader(root, metrics, 'icon_challenge', t('chTitle'), onBackHome);
    const topContentY = metrics.canvasH / 2 - headerH;

    const ruleBadge = createNode('RuleBadge', root, 692, 54);
    ruleBadge.setPosition(0, topContentY - 42, 0);
    createUiSprite('Bg', ruleBadge, 'badge_white', 704, 62);
    const ruleLbl = createLabel('Lbl', ruleBadge, '', 20, THEME.textSub, true, 640, 34);

    const gridTopY = topContentY - 84;
    const gridBotY = -metrics.canvasH / 2 + metrics.bottomInset + 24;
    const gridH = Math.max(600, gridTopY - gridBotY);
    const gridCenterY = (gridTopY + gridBotY) / 2;
    const wrap = createNode('ChallengeGrid', root, 712, gridH);
    wrap.setPosition(0, gridCenterY, 0);
    const mask = createNode('Mask', wrap, 712, gridH);
    mask.addComponent(Mask);
    const gridHost = createNode('Content', mask, 712, gridH);
    gridHost.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    gridHost.setPosition(0, gridH / 2, 0);
    const sv = wrap.addComponent(ScrollView);
    sv.content = gridHost;
    sv.vertical = true;
    sv.horizontal = false;
    sv.elastic = true;

    const toastNode = createNode('ChallengeToast', root, 540, 58);
    toastNode.setPosition(0, topContentY - 42, 0);
    drawRoundedBox(toastNode.addComponent(Graphics), 540, 58, 29, new Color(56, 38, 30, 232));
    const toastLbl = createLabel('Lbl', toastNode, '', 21, Color.WHITE, false, 500, 34);
    toastNode.active = false;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    const showLocalToast = (msg: string) => {
        toastLbl.string = msg;
        toastNode.active = true;
        toastNode.setSiblingIndex(root.children.length - 1);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            if (toastNode.isValid) toastNode.active = false;
        }, 2000);
    };

    const refresh = () => {
        titleLbl.string = t('chTitle');
        ruleLbl.string = t('chDesc', SaveManager.ins.coins);

        gridHost.removeAllChildren();
        const challenges = LevelManager.ins.challengeLevels;
        const cardW = 334;
        const cardH = 420;
        const gapX = 20;
        const gapY = 22;

        challenges.forEach((lv, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const cx = col === 0 ? -(cardW / 2 + gapX / 2) : (cardW / 2 + gapX / 2);
            const cy = -row * (cardH + gapY) - cardH / 2 - 12;

            const reqStage = requiredStageForChallengeIndex(i);
            const unlocked = SaveManager.ins.isChallengeUnlocked(lv.id, reqStage);
            const save = SaveManager.ins.getLevelSave(lv.id);
            const done = SaveManager.ins.isCompleted(lv);

            const tile = createNode(`Ch_${lv.id}`, gridHost, cardW, cardH);
            tile.setPosition(cx, cy, 0);
            createUiSprite('TileBg', tile, 'panel_card', cardW + 18, cardH + 18);

            const prevSz = Math.min(220, cardH - 180);
            const prev = createNode('Prev', tile, prevSz, prevSz);
            prev.setPosition(0, cardH * 0.17, 0);
            drawLevelThumbnail(prev.addComponent(Graphics), lv, prevSz, new Set(save.filled), done, true);

            createLabel('Name', tile, levelName(lv), 22, THEME.text, true, cardW - 34, 32).node.setPosition(0, -cardH * 0.17, 0);
            const metaText = unlocked
                ? `${difficultyStars(lv.difficulty)} · ${lv.width}×${lv.height} · ${lv.total}`
                : `${difficultyStars(lv.difficulty)} · ${t('chMeta', lv.width, lv.height, lv.total, lv.estimatedMinutes, reqStage)}`;
            createLabel(
                'Meta',
                tile,
                metaText,
                16,
                THEME.textSub,
                false,
                cardW - 34,
                26,
            ).node.setPosition(0, -cardH * 0.26, 0);

            if (unlocked) {
                const ctaLabel = done ? t('chDoneBtn') : t('chPlayBtn');
                const cta = createPillButton(
                    'CTA',
                    tile,
                    ctaLabel,
                    252,
                    54,
                    THEME.primary,
                    Color.WHITE,
                    () => {
                        AudioManager.ins.playClick();
                        onStartLevel(lv);
                    },
                    21,
                    undefined,
                    undefined,
                    0,
                    'btn_pink',
                );
                cta.setPosition(0, -cardH * 0.39, 0);
            } else {
                const coinBtn = createPillButton(
                    'UnlockCoin',
                    tile,
                    t('chUnlockCoinBtn', ECONOMY.CHALLENGE_UNLOCK_COINS),
                    148,
                    50,
                    THEME.accent,
                    Color.WHITE,
                    () => {
                        AudioManager.ins.playClick();
                        if (SaveManager.ins.unlockChallengeWithCoins(lv.id)) {
                            onToastHome(t('chUnlockedToast', levelName(lv)));
                            onStartLevel(lv);
                        } else {
                            const need = Math.max(1, ECONOMY.CHALLENGE_UNLOCK_COINS - SaveManager.ins.coins);
                            showLocalToast(t('chNoCoins', need));
                        }
                    },
                    17,
                    undefined,
                    'icon_coin',
                    20,
                    'btn_gold',
                );
                coinBtn.setPosition(-78, -cardH * 0.39, 0);

                const adBtn = createPillButton(
                    'UnlockAd',
                    tile,
                    t('chUnlockBtn'),
                    148,
                    50,
                    new Color(138, 92, 246, 255),
                    Color.WHITE,
                    async () => {
                        AudioManager.ins.playClick();
                        const ok = await AdManager.ins.showRewardedAd('unlock_challenge');
                        if (ok) {
                            SaveManager.ins.unlockChallenge(lv.id);
                            onToastHome(t('chUnlockedToast', levelName(lv)));
                            onStartLevel(lv);
                        } else {
                            showLocalToast(t('chCancelToast'));
                        }
                    },
                    17,
                    undefined,
                    'icon_ad',
                    20,
                    'btn_purple',
                );
                adBtn.setPosition(78, -cardH * 0.39, 0);
            }
        });

        const rowsTotal = Math.ceil(challenges.length / 2);
        gridHost.getComponent(UITransform)!.setContentSize(712, Math.max(gridH, rowsTotal * (cardH + gapY) + 24));
        sv.scrollToTop(0.05);
    };

    return { node: root, refresh };
}
