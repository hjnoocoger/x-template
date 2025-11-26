import { ExternalRewardItem, EquipmentAttribute } from "../dungeon/external_reward_pool";

type PlayerID = number;

export class EquipmentVaultSystem {
    private static playerVaults: Record<PlayerID, ExternalRewardItem[]> = {};

    // 保存装备到仓库
    public static SaveToVault(playerId: PlayerID, reward: ExternalRewardItem): void {
        print(`[EquipmentVaultSystem] 保存玩家${playerId}获得的装备：${reward.name}`);
        if (!this.playerVaults[playerId]) {
            this.playerVaults[playerId] = [];
        }
        this.playerVaults[playerId].push(reward);
        
        // ⭐ 持久化保存
        this.SaveToPersistentStorage(playerId);
    }

    // 获取仓库
    public static GetVault(playerId: PlayerID): ExternalRewardItem[] {
        return this.playerVaults[playerId] ?? [];
    }
    
    // ⭐ 新增：装备到英雄
    public static EquipItem(playerId: PlayerID, itemIndex: number): boolean {
        const vault = this.GetVault(playerId);
        if (itemIndex < 0 || itemIndex >= vault.length) {
            print(`[EquipmentVaultSystem] ❌ 无效的装备索引：${itemIndex}`);
            return false;
        }
        
        const item = vault[itemIndex];
        const hero = PlayerResource.GetSelectedHeroEntity(playerId);
        if (!hero) {
            print(`[EquipmentVaultSystem] ❌ 找不到玩家${playerId}的英雄`);
            return false;
        }
        
        // 应用装备属性
        this.ApplyItemStats(hero, item);
        
        // 从仓库移除
        vault.splice(itemIndex, 1);
        this.SaveToPersistentStorage(playerId);
        
        print(`[EquipmentVaultSystem] ✓ 玩家${playerId}装备了：${item.name}`);
        return true;
    }
    
    // ⭐ 新增：应用装备属性到英雄
    private static ApplyItemStats(hero: CDOTA_BaseNPC_Hero, item: ExternalRewardItem): void {
        switch (item.attribute) {
            case EquipmentAttribute.STRENGTH:
                hero.SetBaseStrength(hero.GetBaseStrength() + item.value);
                break;
            case EquipmentAttribute.AGILITY:
                hero.SetBaseAgility(hero.GetBaseAgility() + item.value);
                break;
            case EquipmentAttribute.INTELLIGENCE:
                hero.SetBaseIntellect(hero.GetBaseIntellect() + item.value);
                break;
            case EquipmentAttribute.ARMOR:
                hero.SetPhysicalArmorBaseValue(hero.GetPhysicalArmorBaseValue() + item.value);
                break;
            default:
                print(`[EquipmentVaultSystem] ⚠️ 未知属性类型：${item.attribute}`);
                return;
        }
        
        print(`[EquipmentVaultSystem] 应用属性：${item.name} - ${item.attribute} +${item.value}`);
    }
    
    // ⭐ 新增：持久化保存
    private static SaveToPersistentStorage(playerId: PlayerID): void {
        const items = this.playerVaults[playerId] || [];
        
        // 使用 CustomNetTables 保存（跨局持久化）
        CustomNetTables.SetTableValue("player_vaults", playerId.toString(), {
            items: items,
            timestamp: Time()
        });
        
        print(`[EquipmentVaultSystem] ✓ 持久化保存玩家${playerId}的仓库，共${items.length}件装备`);
    }
    
    // ⭐ 新增：从持久化存储加载
    public static LoadFromPersistentStorage(playerId: PlayerID): void {
        const data = CustomNetTables.GetTableValue("player_vaults", playerId.toString());
        if (data && data.items) {
            this.playerVaults[playerId] = data.items as ExternalRewardItem[];
            print(`[EquipmentVaultSystem] ✓ 加载玩家${playerId}的仓库，共${this.playerVaults[playerId].length}件装备`);
        } else {
            this.playerVaults[playerId] = [];
            print(`[EquipmentVaultSystem] 玩家${playerId}的仓库为空`);
        }
    }
    
    // ⭐ 新增：获取仓库装备数量
    public static GetVaultSize(playerId: PlayerID): number {
        return this.GetVault(playerId).length;
    }
    
    // ⭐ 新增：清空仓库（用于测试）
    public static ClearVault(playerId: PlayerID): void {
        this.playerVaults[playerId] = [];
        this.SaveToPersistentStorage(playerId);
        print(`[EquipmentVaultSystem] ✓ 清空玩家${playerId}的仓库`);
    }
}