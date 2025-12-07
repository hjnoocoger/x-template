/**
 * 副本系统常量配置
 */

/**
 * 统一的副本生成区域中心点
 * 对应 CAMERA_ZONES.BATTLE_ROOM 的中心区域
 * BATTLE_ROOM 范围: minX: -2000, maxX: 2000, minY: 2000, maxY: 10000
 * 中心点: X=0 (中心), Y=6000 (垂直中心), Z=256
 */
export const DUNGEON_SPAWN_CENTER = Vector(0, 6000, 256);

/**
 * 多个副本实例之间的X轴偏移量
 * 当有多个副本实例时，在X轴上偏移以避免重叠
 */
export const DUNGEON_INSTANCE_OFFSET_X = 3000;
