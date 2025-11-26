// 局外装备类型枚举
export enum ExternalItemType {
    WEAPON = "武器",
    ARMOR = "护甲",
    HELMET = "头盔",
    BELT = "腰带",
    BOOTS = "鞋子",
    RING = "戒指",
    NECKLACE = "项链",
    TRINKET = "饰品"
}

// 装备属性类型枚举
export enum EquipmentAttribute {
    STRENGTH = "力量",
    AGILITY = "敏捷",
    INTELLIGENCE = "智力",
    ARMOR = "护甲"
}

// 局外装备定义
export interface ExternalRewardItem {
    name: string;        // 装备名称
    type: ExternalItemType; // 装备类型
    icon: string;        // 图片路径
    attribute: string;   // 属性类型（如力量/护甲）
    value: number;       // 属性值
}

// 局外奖励池 - 初始装备列表
export const EXTERNAL_REWARD_POOL: ExternalRewardItem[] = [
    { name: "铁剑", type: ExternalItemType.WEAPON, icon: "file://{images}/custom_game/sword.png", attribute: EquipmentAttribute.STRENGTH, value: 5 },
    { name: "钢剑", type: ExternalItemType.WEAPON, icon: "file://{images}/custom_game/sword_steel.png", attribute: EquipmentAttribute.STRENGTH, value: 8 },
    { name: "皮甲", type: ExternalItemType.ARMOR, icon: "file://{images}/custom_game/armor.png", attribute: EquipmentAttribute.ARMOR, value: 3 },
    { name: "链甲", type: ExternalItemType.ARMOR, icon: "file://{images}/custom_game/armor_chain.png", attribute: EquipmentAttribute.ARMOR, value: 6 },
    { name: "轻型头盔", type: ExternalItemType.HELMET, icon: "file://{images}/custom_game/helmet.png", attribute: EquipmentAttribute.ARMOR, value: 2 },
    { name: "重型头盔", type: ExternalItemType.HELMET, icon: "file://{images}/custom_game/helmet_heavy.png", attribute: EquipmentAttribute.ARMOR, value: 4 },
    { name: "法力项链", type: ExternalItemType.NECKLACE, icon: "file://{images}/custom_game/necklace.png", attribute: EquipmentAttribute.INTELLIGENCE, value: 10 },
    { name: "敏捷戒指", type: ExternalItemType.RING, icon: "file://{images}/custom_game/ring.png", attribute: EquipmentAttribute.AGILITY, value: 7 }
];