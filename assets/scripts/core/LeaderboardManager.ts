import { getLang, t } from './I18n';
import { LevelManager } from './LevelManager';
import { SaveManager } from './SaveManager';

export type LeaderboardTab = 'stages' | 'beads' | 'speed';

export interface LeaderboardEntry {
    rank: number;
    name: string;
    avatarColor: string;
    title: string;
    stagesCleared: number;
    totalBeads: number;
    bestSeconds: number;
    isSelf: boolean;
}

const PEER_PROFILES = [
    { name: '手作甜豆酱', nameEn: 'CandyBead', color: '#FF6B9D', title: '名画大宗师', titleEn: 'Grand Master', stages: 26, beads: 58400, speed: 420 },
    { name: '卡皮巴拉本拉', nameEn: 'CapyChill', color: '#E09F3E', title: '九拼巨匠', titleEn: 'Epic Crafter', stages: 21, beads: 34200, speed: 680 },
    { name: 'Momo爱拼豆', nameEn: 'MomoPixel', color: '#9F7AEA', title: '千禧玩家', titleEn: 'Y2K Artist', stages: 16, beads: 18600, speed: 890 },
    { name: '阿柴芝士控', nameEn: 'ShibaCheese', color: '#2EC4B6', title: '配色鬼才', titleEn: 'Color Pro', stages: 12, beads: 11200, speed: 1040 },
    { name: '啵啵奶茶不加糖', nameEn: 'BobaTea', color: '#4EA8DE', title: '四拼达人', titleEn: 'Cozy Maker', stages: 8, beads: 5640, speed: 1180 },
    { name: '深夜熨斗侠', nameEn: 'MidnightIron', color: '#F94144', title: '拼豆卷王', titleEn: 'Speed Fuser', stages: 5, beads: 2860, speed: 1320 },
    { name: '周末宅家手作', nameEn: 'CozyWeekend', color: '#74C69D', title: '进阶学徒', titleEn: 'Bead Adepts', stages: 3, beads: 1380, speed: 1480 },
    { name: '草莓千层小新', nameEn: 'MatchaCake', color: '#F48C06', title: '入坑萌新', titleEn: 'Starter', stages: 2, beads: 820, speed: 1640 },
    { name: '第一粒豆子', nameEn: 'FirstBead', color: '#64748B', title: '工坊新人', titleEn: 'Newcomer', stages: 1, beads: 380, speed: 240 },
];

export class LeaderboardManager {
    private static _ins: LeaderboardManager | null = null;
    public static get ins(): LeaderboardManager {
        if (!this._ins) {
            this._ins = new LeaderboardManager();
        }
        return this._ins;
    }

    public getEntries(tab: LeaderboardTab): { list: LeaderboardEntry[]; selfEntry: LeaderboardEntry; gapText: string } {
        const isEn = getLang() === 'en';
        const allLevels = LevelManager.ins.levels;
        const completedCount = SaveManager.ins.getCompletedCount(allLevels);
        const totalBeads = SaveManager.ins.getTotalPlacedBeads(allLevels);
        const bestSec = SaveManager.ins.getBestClearSeconds(allLevels) ?? 0;

        const selfName = isEn && SaveManager.ins.nickname === '拼豆主理人' ? 'Studio Owner' : SaveManager.ins.nickname;
        const selfRaw: LeaderboardEntry = {
            rank: 0,
            name: selfName,
            avatarColor: '#FF6B8B',
            title: isEn ? `Lv.${SaveManager.ins.playerLevel} Crafter` : `Lv.${SaveManager.ins.playerLevel} 工坊主理人`,
            stagesCleared: completedCount,
            totalBeads,
            bestSeconds: bestSec,
            isSelf: true,
        };

        const list: LeaderboardEntry[] = PEER_PROFILES.map((p) => ({
            rank: 0,
            name: isEn ? p.nameEn : p.name,
            avatarColor: p.color,
            title: isEn ? p.titleEn : p.title,
            stagesCleared: p.stages,
            totalBeads: p.beads,
            bestSeconds: p.speed,
            isSelf: false,
        }));
        list.push(selfRaw);

        list.sort((a, b) => {
            if (tab === 'stages') {
                if (b.stagesCleared !== a.stagesCleared) return b.stagesCleared - a.stagesCleared;
                return b.totalBeads - a.totalBeads;
            }
            if (tab === 'beads') {
                if (b.totalBeads !== a.totalBeads) return b.totalBeads - a.totalBeads;
                return b.stagesCleared - a.stagesCleared;
            }
            const aValid = a.bestSeconds > 0 ? a.bestSeconds : 999999;
            const bValid = b.bestSeconds > 0 ? b.bestSeconds : 999999;
            if (aValid !== bValid) return aValid - bValid;
            return b.stagesCleared - a.stagesCleared;
        });

        list.forEach((e, idx) => {
            e.rank = idx + 1;
        });

        const selfIdx = list.findIndex((e) => e.isSelf);
        const selfEntry = list[selfIdx];
        let gapText = t('lbTop1');
        if (selfIdx > 0) {
            const above = list[selfIdx - 1];
            if (tab === 'stages') {
                const diff = Math.max(1, above.stagesCleared - selfEntry.stagesCleared);
                gapText = t('lbGapStages', diff, above.name);
            } else if (tab === 'beads') {
                const diff = Math.max(1, above.totalBeads - selfEntry.totalBeads);
                gapText = t('lbGapBeads', diff, above.name);
            } else if (selfEntry.bestSeconds === 0) {
                gapText = t('lbGapNoSpeed');
            } else {
                const diff = Math.max(1, selfEntry.bestSeconds - above.bestSeconds);
                gapText = t('lbGapSpeed', diff, above.name);
            }
        }

        return { list, selfEntry, gapText };
    }
}

export function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}
