/**
 * 副本系统事件类型定义
 * 用于服务端和客户端之间的类型安全通信
 */

/**
 * 副本信息
 */
export interface DungeonInfo {
    id: string;      // 副本ID
    name: string;    // 副本名称（中文）
}

/**
 * show_dungeon_menu 事件数据
 * 服务端发送给客户端，显示副本选择菜单
 */
export interface ShowDungeonMenuEvent {
    dungeons: DungeonInfo[];
}

/**
 * select_dungeon 事件数据
 * 客户端发送给服务端，选择副本
 */
export interface SelectDungeonEvent {
    PlayerID: PlayerID;
    dungeon_type: string;
    difficulty: string;
}
