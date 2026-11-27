import { ImageAsset, resources, SpriteFrame } from 'cc';

const UI_NINE_SLICE: Record<string, [number, number, number, number]> = {
    // [left, right, top, bottom] keep glint dots inside left cap & lip inside bottom band
    btn_hero_gold: [62, 62, 24, 30],
    btn_gold: [46, 46, 18, 22],
    btn_pink: [46, 46, 18, 22],
    btn_purple: [46, 46, 18, 22],
    btn_mint: [46, 46, 18, 22],
    btn_cream: [38, 38, 18, 22],
    badge_white: [28, 28, 14, 16],
    card_row: [38, 38, 36, 40],
    panel_card: [64, 64, 64, 64],
    progress_track: [32, 32, 16, 18],
    progress_fill: [24, 24, 10, 14],
};

export class ResManager {
    private static _ins: ResManager | null = null;
    public static get ins(): ResManager {
        if (!this._ins) {
            this._ins = new ResManager();
        }
        return this._ins;
    }

    private _textures: Map<string, SpriteFrame> = new Map();
    private _icons: Map<string, SpriteFrame> = new Map();
    private _ui: Map<string, SpriteFrame> = new Map();
    private _beads: Map<string, SpriteFrame> = new Map();
    private _numbers: Map<string, SpriteFrame> = new Map();
    private _loaded = false;

    public async loadAll(): Promise<void> {
        if (this._loaded) return;
        await Promise.all([
            this._loadImageDir('textures', this._textures),
            this._loadImageDir('icons', this._icons),
            this._loadImageDir('ui', this._ui),
            this._loadImageDir('beads', this._beads),
            this._loadImageDir('numbers', this._numbers),
        ]);
        console.log(
            `[ResManager] loaded textures=${this._textures.size}, icons=${this._icons.size}, ui=${this._ui.size}, beads=${this._beads.size}, numbers=${this._numbers.size}`,
        );
        this._loaded = true;
    }

    private _loadImageDir(dir: string, target: Map<string, SpriteFrame>): Promise<void> {
        return new Promise((resolve) => {
            const infos = resources.getDirWithPath(dir, ImageAsset);
            const uuidToName = new Map<string, string>();
            for (const info of infos) {
                const segs = info.path.split('/');
                const fname = segs[segs.length - 1];
                if (fname) uuidToName.set(info.uuid, fname);
            }
            resources.loadDir(dir, ImageAsset, (err, images) => {
                if (!err && images && images.length > 0) {
                    for (const img of images) {
                        const name = uuidToName.get(img.uuid) || img.name;
                        if (!name) continue;
                        const sf = SpriteFrame.createWithImage(img);
                        sf.name = name;
                        const insets = dir === 'ui' ? UI_NINE_SLICE[name] : undefined;
                        if (insets) {
                            sf.insetLeft = insets[0];
                            sf.insetRight = insets[1];
                            sf.insetTop = insets[2];
                            sf.insetBottom = insets[3];
                        }
                        target.set(name, sf);
                    }
                    resolve();
                    return;
                }
                resources.loadDir(dir, SpriteFrame, (err2, frames) => {
                    if (!err2 && frames) {
                        for (const sf of frames) {
                            const insets = dir === 'ui' ? UI_NINE_SLICE[sf.name] : undefined;
                            if (insets) {
                                sf.insetLeft = insets[0];
                                sf.insetRight = insets[1];
                                sf.insetTop = insets[2];
                                sf.insetBottom = insets[3];
                            }
                            target.set(sf.name, sf);
                        }
                    }
                    resolve();
                });
            });
        });
    }

    public getTexture(name: string): SpriteFrame | null {
        return this._textures.get(name) || null;
    }

    public getIcon(name: string): SpriteFrame | null {
        return this._icons.get(name) || null;
    }

    public getUi(name: string): SpriteFrame | null {
        return this._ui.get(name) || null;
    }

    public getBead(name: string): SpriteFrame | null {
        return this._beads.get(name) || null;
    }

    public getNumber(num: number): SpriteFrame | null {
        return this._numbers.get(`n_${num}`) || null;
    }
}
