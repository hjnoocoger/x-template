import { BaseAbility, registerAbility } from "../utils/dota_ts_adapter";
import { GetDungeonManager } from "../dungeons/DungeonManager";

@registerAbility()
export class portal_logic extends BaseAbility {
    private lastTriggerTime: Map<PlayerID, number> = new Map();
    private readonly COOLDOWN_TIME = 3.0; // 3秒冷却时间
    private readonly TRIGGER_RADIUS = 200; // 触发半径

    OnThink(): void {
        const portalLocation = this.GetCaster().GetAbsOrigin();
        const players: PlayerID[] = [];

        // 遍历所有有效玩家
        const playerCount = PlayerResource.GetPlayerCount();
        for (let i = 0; i < playerCount; i++) {
            if (PlayerResource.IsValidPlayerID(i)) {
                players.push(i);
            }
        }

        // 检测玩家是否进入传送范围
        players.forEach(playerId => {
            const hero = PlayerResource.GetSelectedHeroEntity(playerId);
            if (!hero || !hero.IsAlive()) return;

            const pos1 = hero.GetAbsOrigin();
            const pos2 = portalLocation;

            // 计算玩家位置与传送门的距离
            const distance = ((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2) ** 0.5;
            if (distance <= this.TRIGGER_RADIUS) { // 玩家进入传送门范围
                this.TriggerTeleport(hero, playerId);
            }
        });
    }

    private TriggerTeleport(hero: CDOTA_BaseNPC_Hero, playerId: PlayerID): void {
        // 检查冷却时间
        const currentTime = GameRules.GetGameTime();
        const lastTrigger = this.lastTriggerTime.get(playerId) || 0;
        
        if (currentTime - lastTrigger < this.COOLDOWN_TIME) {
            return; // 还在冷却中
        }
        
        // 更新最后触发时间
        this.lastTriggerTime.set(playerId, currentTime);
        
        // 获取副本管理器
        const manager = GetDungeonManager();
        
        // 使用默认副本ID（可以根据需要改为菜单选择）
        const dungeonId = 'test_simple';
        
        // 在固定的副本区域创建副本实例
        const instanceId = manager.CreateDungeon(dungeonId);
        
        if (instanceId) {
            // 进入副本（会自动切换摄像头）
            manager.EnterDungeon(playerId, instanceId);
            
            hero.EmitSound("Portal.Hero_Appear");
            
            GameRules.SendCustomMessage(
                `<font color='#FF6600'>你已通过传送门进入副本！</font>`,
                playerId,
                0
            );
            
            print(`[PortalLogic] 玩家 ${playerId} 通过传送门进入副本 ${instanceId}`);
        } else {
            GameRules.SendCustomMessage(
                `<font color='#FF0000'>副本创建失败！</font>`,
                playerId,
                0
            );
        }
    }
}