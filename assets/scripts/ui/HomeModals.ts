import { Button, Color, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { AdManager, AdPlacementMeta } from '../core/AdManager';
import { AudioManager } from '../core/AudioManager';
import { t } from '../core/I18n';
import { ResManager } from '../core/ResManager';
import { SaveManager } from '../core/SaveManager';
import { ECONOMY } from '../core/Types';
import type { LayoutMetrics } from '../PindouApp';
import {
    THEME,
    createIconSprite,
    createLabel,
    createLeftLabel,
    createNode,
    createPillButton,
    createUiSprite,
    drawRoundedBox,
} from './UIHelper';

function makeDimOverlay(parent: Node, name: string, metrics: LayoutMetrics, alpha = 158): Node {
    const ov = createNode(name, parent, metrics.canvasW, metrics.canvasH);
    const g = ov.addComponent(Graphics);
    g.fillColor = new Color(34, 22, 18, alpha);
    g.rect(-metrics.canvasW / 2, -metrics.canvasH / 2, metrics.canvasW, metrics.canvasH);
    g.fill();
    ov.addComponent(Button);
    return ov;
}

function attachPanelBg(card: Node, w: number, h: number): void {
    if (!createUiSprite('CardBg', card, 'panel_card', w + 26, h + 26)) {
        drawRoundedBox(card.addComponent(Graphics), w, h, 34, Color.WHITE, THEME.cardBorder, 3, true);
    } else {
        card.getChildByName('CardBg')?.setPosition(0, -2, 0);
    }
}

export function showRewardedAdOverlay(
    parent: Node,
    metrics: LayoutMetrics,
    meta: AdPlacementMeta,
    onDone: (rewarded: boolean) => void,
): void {
    const ov = makeDimOverlay(parent, 'AdVideoOverlay', metrics, 212);
    const card = createNode('AdCard', ov, 620, 680);
    drawRoundedBox(card.addComponent(Graphics), 620, 680, 34, new Color(34, 30, 48, 255), new Color(138, 112, 210, 255), 3, true);

    const badge = createNode('AdTag', card, 210, 40);
    badge.setPosition(-180, 296, 0);
    drawRoundedBox(badge.addComponent(Graphics), 210, 40, 20, new Color(72, 62, 108, 255));
    createLabel('Lbl', badge, t('adTag'), 19, new Color(224, 212, 255, 255), true, 186, 32);

    let remaining = 3;
    let finished = false;

    const stageBox = createNode('AdStage', card, 540, 340);
    stageBox.setPosition(0, 62, 0);
    drawRoundedBox(stageBox.addComponent(Graphics), 540, 340, 26, new Color(54, 46, 78, 255), new Color(110, 94, 168, 255), 2);
    const adIcon = createIconSprite('AdIcon', stageBox, 'icon_ad', 112);
    if (adIcon) adIcon.node.setPosition(0, 44, 0);
    createLabel('MetaTitle', stageBox, meta.title, 30, Color.WHITE, true, 490, 44).node.setPosition(0, -68, 0);

    const barBg = createNode('BarBg', card, 500, 16);
    barBg.setPosition(0, -158, 0);
    drawRoundedBox(barBg.addComponent(Graphics), 500, 16, 8, new Color(68, 58, 96, 255));
    const barFill = createNode('BarFill', barBg, 500, 16).addComponent(Graphics);

    const claimBtn = createPillButton(
        'ClaimBtn',
        card,
        t('adPlayingBtn', remaining),
        356,
        74,
        THEME.primary,
        Color.WHITE,
        () => {
            if (!finished) return;
            AudioManager.ins.playClick();
            ov.destroy();
            onDone(true);
        },
        24,
        undefined,
        undefined,
        0,
        'btn_cream',
    );
    claimBtn.setPosition(0, -236, 0);
    const claimLbl = claimBtn.getChildByName('Label')!.getComponent(Label)!;
    claimLbl.color = THEME.textSub;
    const claimBgSp = claimBtn.getChildByName('Bg')?.getComponent(Sprite);

    const closeBtn = createPillButton(
        'SkipBtn',
        card,
        t('adSkipBtn'),
        196,
        44,
        new Color(70, 64, 92, 255),
        THEME.textSub,
        () => {
            AudioManager.ins.playClick();
            ov.destroy();
            onDone(false);
        },
        18,
        undefined,
        undefined,
        0,
        'btn_cream',
    );
    closeBtn.setPosition(0, -304, 0);

    let elapsed = 0;
    const tick = setInterval(() => {
        if (!ov.isValid) {
            clearInterval(tick);
            return;
        }
        elapsed += 0.1;
        const pct = Math.min(1, elapsed / 3.0);
        barFill.clear();
        barFill.fillColor = THEME.mint;
        barFill.roundRect(-250, -8, Math.max(16, 500 * pct), 16, 8);
        barFill.fill();
        const left = Math.max(0, Math.ceil(3.0 - elapsed));
        if (left !== remaining && left > 0) {
            remaining = left;
            claimLbl.string = t('adPlayingBtn', remaining);
        }
        if (elapsed >= 3.0 && !finished) {
            finished = true;
            clearInterval(tick);
            claimLbl.string = t('adClaimBtn');
            claimLbl.color = Color.WHITE;
            const pinkSf = ResManager.ins.getUi('btn_pink');
            if (claimBgSp && pinkSf) claimBgSp.spriteFrame = pinkSf;
        }
    }, 100);
}

export function showAdSupplyModal(
    parent: Node,
    metrics: LayoutMetrics,
    onToast: (msg: string) => void,
    onUpdated: () => void,
    onClose: () => void,
): void {
    const ov = makeDimOverlay(parent, 'AdSupplyModal', metrics);
    const card = createNode('Card', ov, 660, 760);
    attachPanelBg(card, 660, 760);

    const ic = createIconSprite('Ic', card, 'icon_ad', 44);
    if (ic) ic.node.setPosition(-120, 318, 0);
    createLabel('Title', card, t('supTitle'), 30, THEME.text, true, 280, 44).node.setPosition(26, 318, 0);
    const coinBadge = createNode('CoinBal', card, 190, 46);
    coinBadge.setPosition(0, 268, 0);
    createUiSprite('Bg', coinBadge, 'badge_white', 202, 54);
    const cIc = createIconSprite('Ic', coinBadge, 'icon_coin', 28);
    if (cIc) cIc.node.setPosition(-54, 1, 0);
    const subLbl = createLabel('Sub', coinBadge, `${SaveManager.ins.coins}`, 23, new Color(168, 96, 12, 255), true, 108, 32);
    subLbl.node.setPosition(16, 1, 0);

    const items = [
        {
            icon: 'icon_bucket',
            title: () => t('supFloodTitle', SaveManager.ins.floodCharges),
            desc: t('supFloodDesc'),
            coinBtnText: t('supBuyFloodBtn', ECONOMY.FLOOD_PACK_COINS),
            coinCost: ECONOMY.FLOOD_PACK_COINS,
            buyWithCoins: () => {
                if (SaveManager.ins.buyFloodPackWithCoins()) {
                    onToast(t('supFloodBought', ECONOMY.FLOOD_PACK_COINS));
                    return true;
                }
                onToast(t('supNoCoins', ECONOMY.FLOOD_PACK_COINS));
                return false;
            },
            adBtnText: t('supFloodBtn'),
            placement: 'flood_refill' as const,
            reward: () => { SaveManager.ins.addFloodCharges(ECONOMY.FLOOD_PACK_CHARGES); onToast(t('supFloodOk')); },
        },
        {
            icon: 'icon_magic',
            title: () => t('supMagicTitle', SaveManager.ins.magicCharges),
            desc: t('supMagicDesc'),
            coinBtnText: t('supBuyMagicBtn', ECONOMY.MAGIC_PACK_COINS),
            coinCost: ECONOMY.MAGIC_PACK_COINS,
            buyWithCoins: () => {
                if (SaveManager.ins.buyMagicPackWithCoins()) {
                    onToast(t('supMagicBought', ECONOMY.MAGIC_PACK_COINS));
                    return true;
                }
                onToast(t('supNoCoins', ECONOMY.MAGIC_PACK_COINS));
                return false;
            },
            adBtnText: t('supMagicBtn'),
            placement: 'magic_refill' as const,
            reward: () => { SaveManager.ins.addMagicCharges(ECONOMY.MAGIC_PACK_CHARGES); onToast(t('supMagicOk')); },
        },
        {
            icon: 'icon_coin',
            title: () => t('supGiftTitle', SaveManager.ins.canClaimDailyGift() ? t('supGiftReady') : t('supGiftMore')),
            desc: t('supGiftDesc'),
            coinBtnText: '',
            coinCost: 0,
            buyWithCoins: null as (() => boolean) | null,
            adBtnText: t('supGiftBtn'),
            placement: 'daily_pack' as const,
            reward: () => {
                SaveManager.ins.addFloodCharges(2);
                SaveManager.ins.addMagicCharges(1);
                SaveManager.ins.addCoins(80);
                SaveManager.ins.markDailyGiftClaimed();
                onToast(t('supGiftOk'));
            },
        },
    ];

    items.forEach((it, idx) => {
        const box = createNode(`Item_${idx}`, card, 594, 146);
        box.setPosition(0, 140 - idx * 162, 0);
        createUiSprite('ItemBg', box, 'card_row', 608, 160);

        const s = createIconSprite('Ico', box, it.icon, 56);
        if (s) s.node.setPosition(-240, 2, 0);

        const titleLbl = createLeftLabel('T', box, it.title(), -194, 24, 250, 32, 22, THEME.text, true);
        createLeftLabel('D', box, it.desc, -194, -18, 250, 44, 17, THEME.textSub, false);

        if (it.buyWithCoins) {
            const coinBtn = createPillButton(
                'CoinBuy',
                box,
                it.coinBtnText,
                192,
                50,
                THEME.accent,
                Color.WHITE,
                () => {
                    AudioManager.ins.playClick();
                    if (it.buyWithCoins!()) {
                        titleLbl.string = it.title();
                        subLbl.string = `${SaveManager.ins.coins}`;
                        onUpdated();
                    }
                },
                18,
                undefined,
                'icon_coin',
                22,
                'btn_gold',
            );
            coinBtn.setPosition(176, 30, 0);

            const adBtn = createPillButton('AdGo', box, it.adBtnText, 192, 50, THEME.primary, Color.WHITE, async () => {
                AudioManager.ins.playClick();
                const ok = await AdManager.ins.showRewardedAd(it.placement);
                if (ok) {
                    it.reward();
                    onUpdated();
                    ov.destroy();
                    onClose();
                } else {
                    onToast(t('supCancel'));
                }
            }, 18, undefined, 'icon_ad', 22, 'btn_pink');
            adBtn.setPosition(176, -28, 0);
        } else {
            const b = createPillButton('AdGo', box, it.adBtnText, 192, 58, THEME.primary, Color.WHITE, async () => {
                AudioManager.ins.playClick();
                const ok = await AdManager.ins.showRewardedAd(it.placement);
                if (ok) {
                    it.reward();
                    onUpdated();
                    ov.destroy();
                    onClose();
                } else {
                    onToast(t('supCancel'));
                }
            }, 20, undefined, 'icon_ad', 24, 'btn_pink');
            b.setPosition(176, 2, 0);
        }
    });

    createPillButton('Close', card, t('close'), 220, 60, THEME.bg, THEME.text, () => {
        AudioManager.ins.playClick();
        ov.destroy();
        onClose();
    }, 22, undefined, undefined, 0, 'btn_cream').setPosition(0, -314, 0);
}

/** Quick in-editor refill dialog offering Coin Purchase OR Rewarded Ad */
export function showBoosterRefillModal(
    parent: Node,
    metrics: LayoutMetrics,
    kind: 'flood' | 'magic',
    onToast: (msg: string) => void,
    onRefilled: (usedCoins: boolean) => void,
): void {
    const ov = makeDimOverlay(parent, 'BoosterRefillModal', metrics);
    const card = createNode('Card', ov, 560, 448);
    attachPanelBg(card, 560, 448);

    const isFlood = kind === 'flood';
    const cost = isFlood ? ECONOMY.FLOOD_PACK_COINS : ECONOMY.MAGIC_PACK_COINS;
    const iconKey = isFlood ? 'icon_bucket' : 'icon_magic';

    const ic = createIconSprite('Ic', card, iconKey, 54);
    if (ic) ic.node.setPosition(0, 152, 0);

    createLabel('Title', card, t(isFlood ? 'refillTitleFlood' : 'refillTitleMagic'), 28, THEME.text, true, 500, 40)
        .node.setPosition(0, 94, 0);
    createLabel('Desc', card, t(isFlood ? 'refillDescFlood' : 'refillDescMagic', SaveManager.ins.coins), 19, THEME.textSub, false, 500, 44)
        .node.setPosition(0, 44, 0);

    createPillButton(
        'BuyCoinsBtn',
        card,
        t('refillCoinBtn', cost),
        380,
        64,
        THEME.accent,
        Color.WHITE,
        () => {
            AudioManager.ins.playClick();
            const ok = isFlood ? SaveManager.ins.buyFloodPackWithCoins() : SaveManager.ins.buyMagicPackWithCoins();
            if (ok) {
                onToast(t(isFlood ? 'supFloodBought' : 'supMagicBought', cost));
                ov.destroy();
                onRefilled(true);
            } else {
                onToast(t('supNoCoins', cost));
            }
        },
        22,
        undefined,
        'icon_coin',
        26,
        'btn_gold',
    ).setPosition(0, -28, 0);

    createPillButton(
        'WatchAdBtn',
        card,
        t('refillAdBtn'),
        380,
        64,
        THEME.primary,
        Color.WHITE,
        async () => {
            AudioManager.ins.playClick();
            const ok = await AdManager.ins.showRewardedAd(isFlood ? 'flood_refill' : 'magic_refill');
            if (ok) {
                if (isFlood) {
                    SaveManager.ins.addFloodCharges(ECONOMY.FLOOD_PACK_CHARGES);
                    onToast(t('edToastGotFlood'));
                } else {
                    SaveManager.ins.addMagicCharges(ECONOMY.MAGIC_PACK_CHARGES);
                    onToast(t('edToastGotMagic'));
                }
                ov.destroy();
                onRefilled(false);
            } else {
                onToast(t('supCancel'));
            }
        },
        22,
        undefined,
        'icon_ad',
        26,
        'btn_pink',
    ).setPosition(0, -104, 0);

    createPillButton('Close', card, t('close'), 200, 52, THEME.bg, THEME.text, () => {
        AudioManager.ins.playClick();
        ov.destroy();
    }, 20, undefined, undefined, 0, 'btn_cream').setPosition(0, -176, 0);
}

export function showSettingsModal(
    parent: Node,
    metrics: LayoutMetrics,
    onChanged: () => void,
    onClose: () => void,
): void {
    const ov = makeDimOverlay(parent, 'SettingsModal', metrics);
    const card = createNode('Card', ov, 520, 410);
    attachPanelBg(card, 520, 410);

    createLabel('Title', card, t('setTitle'), 32, THEME.text, true, 300, 44).node.setPosition(0, 146, 0);

    const isOn = SaveManager.ins.soundOn;
    createPillButton(
        'SoundToggle',
        card,
        isOn ? t('setSoundOn') : t('setSoundOff'),
        360,
        64,
        isOn ? THEME.mint : THEME.bg,
        isOn ? Color.WHITE : THEME.text,
        () => {
            const next = !SaveManager.ins.soundOn;
            SaveManager.ins.setSoundOn(next);
            if (next) AudioManager.ins.playClick();
            onChanged();
            ov.destroy();
            showSettingsModal(parent, metrics, onChanged, onClose);
        },
        22,
        undefined,
        isOn ? 'icon_sound_on' : 'icon_sound_off',
        26,
        isOn ? 'btn_mint' : 'btn_cream',
    ).setPosition(0, 56, 0);

    createPillButton(
        'LangToggle',
        card,
        t('setLang'),
        360,
        64,
        new Color(148, 92, 246, 255),
        Color.WHITE,
        () => {
            AudioManager.ins.playClick();
            const nextLang = SaveManager.ins.language === 'zh' ? 'en' : 'zh';
            SaveManager.ins.setLanguage(nextLang);
            onChanged();
            ov.destroy();
            showSettingsModal(parent, metrics, onChanged, onClose);
        },
        22,
        undefined,
        'icon_star',
        26,
        'btn_purple',
    ).setPosition(0, -28, 0);

    createPillButton('Close', card, t('close'), 220, 58, THEME.primary, Color.WHITE, () => {
        AudioManager.ins.playClick();
        ov.destroy();
        onClose();
    }, 22, undefined, undefined, 0, 'btn_pink').setPosition(0, -128, 0);
}
