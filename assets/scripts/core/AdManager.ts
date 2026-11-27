import { sys } from 'cc';
import { t } from './I18n';

export type AdPlacementId =
    | 'flood_refill'
    | 'magic_refill'
    | 'clear_triple'
    | 'unlock_challenge'
    | 'daily_pack';

export interface AdPlacementMeta {
    id: AdPlacementId;
    adUnitId: string;
    title: string;
    rewardDesc: string;
    sponsorText: string;
}

export function getAdPlacementMeta(id: AdPlacementId): AdPlacementMeta {
    switch (id) {
        case 'flood_refill':
            return {
                id,
                adUnitId: 'adunit-pindou-flood-01',
                title: t('adTitleFlood'),
                rewardDesc: t('adDescFlood'),
                sponsorText: 'adunit-pindou-flood-01',
            };
        case 'magic_refill':
            return {
                id,
                adUnitId: 'adunit-pindou-magic-02',
                title: t('adTitleMagic'),
                rewardDesc: t('adDescMagic'),
                sponsorText: 'adunit-pindou-magic-02',
            };
        case 'clear_triple':
            return {
                id,
                adUnitId: 'adunit-pindou-triple-03',
                title: t('adTitleTriple'),
                rewardDesc: t('adDescTriple'),
                sponsorText: 'adunit-pindou-triple-03',
            };
        case 'unlock_challenge':
            return {
                id,
                adUnitId: 'adunit-pindou-challenge-04',
                title: t('adTitleChallenge'),
                rewardDesc: t('adDescChallenge'),
                sponsorText: 'adunit-pindou-challenge-04',
            };
        case 'daily_pack':
        default:
            return {
                id,
                adUnitId: 'adunit-pindou-daily-05',
                title: t('adTitleDaily'),
                rewardDesc: t('adDescDaily'),
                sponsorText: 'adunit-pindou-daily-05',
            };
    }
}

export type AdOverlayPresenter = (
    meta: AdPlacementMeta,
    onDone: (rewarded: boolean) => void,
) => void;

export class AdManager {
    private static _ins: AdManager | null = null;
    public static get ins(): AdManager {
        if (!this._ins) {
            this._ins = new AdManager();
        }
        return this._ins;
    }

    private _presenter: AdOverlayPresenter | null = null;

    public setOverlayPresenter(presenter: AdOverlayPresenter): void {
        this._presenter = presenter;
    }

    public showRewardedAd(placementId: AdPlacementId): Promise<boolean> {
        const meta = getAdPlacementMeta(placementId);

        const g = globalThis as Record<string, any>;
        if (typeof g.wx !== 'undefined' && typeof g.wx.createRewardedVideoAd === 'function') {
            return new Promise((resolve) => {
                try {
                    const ad = g.wx.createRewardedVideoAd({ adUnitId: meta.adUnitId });
                    const onClose = (res?: { isEnded?: boolean }) => {
                        ad.offClose?.(onClose);
                        ad.offError?.(onErr);
                        resolve(!res || res.isEnded !== false);
                    };
                    const onErr = () => {
                        ad.offClose?.(onClose);
                        ad.offError?.(onErr);
                        resolve(false);
                    };
                    ad.onClose?.(onClose);
                    ad.onError?.(onErr);
                    ad.show().catch(() => {
                        ad.load?.().then(() => ad.show()).catch(() => resolve(false));
                    });
                } catch {
                    resolve(false);
                }
            });
        }

        if (sys.isNative && typeof g.pindouShowRewardedAd === 'function') {
            return new Promise((resolve) => {
                g.pindouShowRewardedAd(meta.adUnitId, (rewarded: boolean) => resolve(!!rewarded));
            });
        }

        return new Promise((resolve) => {
            if (this._presenter) {
                this._presenter(meta, resolve);
            } else {
                resolve(true);
            }
        });
    }
}
