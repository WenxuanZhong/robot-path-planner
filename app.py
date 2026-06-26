"""
移动机器人路径规划与避障可视化仿真器 —— 图形界面（中文版 · 精致 UI）
=====================================================================
左侧是可交互的栅格地图，右侧是深色信息侧栏（标题 / 当前算法 / 运行结果 / 图例 / 操作）。

运行：
    pip install pygame
    python app.py

操作：
    鼠标左键拖动 : 画障碍      鼠标右键拖动 : 擦除
    按 S 再点击   : 设起点      按 G 再点击   : 设终点
    M            : 随机生成地图
    1 / 2 / 3    : 切换算法 A* / Dijkstra / 贪婪
    空格          : 运行规划（带动画）
    C            : 清除搜索痕迹    R : 重置地图    ESC : 退出
"""

import sys
import random
import pygame
from pathfinding import plan

# ---------------- 网格与窗口尺寸 ----------------
ROWS, COLS = 25, 40
CELL = 22
GRID_X, GRID_Y = 16, 16
GRID_W, GRID_H = COLS * CELL, ROWS * CELL
SIDE_X = GRID_X + GRID_W + 16
SIDE_W = 250
WIN_W = SIDE_X + SIDE_W + 16
WIN_H = GRID_Y + GRID_H + 16

# ---------------- 动画参数 ----------------
FPS = 60
SEARCH_PER_FRAME = 6      # 搜索动画：每帧点亮多少个已探索格
PATH_STEP_FRAMES = 3      # 行走动画：机器人每隔几帧前进一格

# ---------------- 配色（现代清爽风）----------------
BG        = (248, 250, 252)   # 窗口背景
GRID_BG   = (255, 255, 255)   # 网格底色
GRID_LINE = (226, 232, 240)   # 网格线
WALL      = (51, 65, 85)      # 障碍
START     = (34, 197, 94)     # 起点（绿）
GOAL      = (239, 68, 68)     # 终点（红）
VISITED   = (191, 219, 254)   # 已探索（淡蓝）
PATH      = (250, 204, 21)    # 最短路径（黄）
ROBOT     = (139, 92, 246)    # 机器人（紫）
SIDEBAR   = (30, 41, 59)      # 侧栏背景（深蓝灰）
SIDE_TEXT = (226, 232, 240)   # 侧栏文字
SIDE_MUTE = (148, 163, 184)   # 侧栏次要文字
ACCENT    = (56, 189, 248)    # 强调色（天蓝）

# 数字键 -> (算法内部名, 中文显示名)
ALGOS = {
    pygame.K_1: ("astar", "A*（A 星）"),
    pygame.K_2: ("dijkstra", "Dijkstra"),
    pygame.K_3: ("greedy", "贪婪最佳优先"),
}


def empty_grid():
    return [[0] * COLS for _ in range(ROWS)]


def random_maze(density=0.25):
    """随机生成障碍地图（按 M 调用），方便快速演示。density 为障碍比例。"""
    return [[1 if random.random() < density else 0 for _ in range(COLS)] for _ in range(ROWS)]


def load_fonts():
    """加载中文字体（优先微软雅黑），保证界面中文正常显示。"""
    reg = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]
    bold = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\simhei.ttf"]

    def pick(cands, size):
        for p in cands:
            try:
                return pygame.font.Font(p, size)
            except Exception:
                continue
        return pygame.font.SysFont("microsoftyahei,simhei,arial", size)

    return {
        "title": pick(bold, 23),
        "h": pick(bold, 16),
        "body": pick(reg, 15),
        "small": pick(reg, 13),
    }


def cell_rect(r, c):
    """某个格子的绘制矩形（内缩 1px，形成瓷砖间隙感）。"""
    return (GRID_X + c * CELL + 1, GRID_Y + r * CELL + 1, CELL - 2, CELL - 2)


def draw(screen, fonts, grid, start, goal, algo_name, result, phase, anim_i, robot_i):
    """根据当前状态画一帧。把绘制单独抽出来，方便复用与离线预览。"""
    screen.fill(BG)
    # 网格白底 + 圆角
    pygame.draw.rect(screen, GRID_BG, (GRID_X - 3, GRID_Y - 3, GRID_W + 6, GRID_H + 6), border_radius=10)

    # 已探索（搜索动画）
    if result:
        for k in range(min(anim_i, len(result["visited"]))):
            r, c = result["visited"][k]
            if (r, c) != start and (r, c) != goal:
                pygame.draw.rect(screen, VISITED, cell_rect(r, c), border_radius=4)

    # 障碍
    for r in range(ROWS):
        for c in range(COLS):
            if grid[r][c] == 1:
                pygame.draw.rect(screen, WALL, cell_rect(r, c), border_radius=4)

    # 最短路径（边走边显示）
    if result and result["found"] and phase in ("path", "done"):
        upto = robot_i + 1 if phase == "path" else len(result["path"])
        for (r, c) in result["path"][:upto]:
            if (r, c) != start and (r, c) != goal:
                pygame.draw.rect(screen, PATH, cell_rect(r, c), border_radius=4)

    # 网格细线
    for r in range(ROWS + 1):
        pygame.draw.line(screen, GRID_LINE, (GRID_X, GRID_Y + r * CELL), (GRID_X + GRID_W, GRID_Y + r * CELL))
    for c in range(COLS + 1):
        pygame.draw.line(screen, GRID_LINE, (GRID_X + c * CELL, GRID_Y), (GRID_X + c * CELL, GRID_Y + GRID_H))

    # 起点、终点
    pygame.draw.rect(screen, START, cell_rect(*start), border_radius=6)
    pygame.draw.rect(screen, GOAL, cell_rect(*goal), border_radius=6)

    # 机器人（沿路径移动的圆点 + 白边）
    if result and result["found"] and phase in ("path", "done") and result["path"]:
        rr, cc = result["path"][robot_i]
        cx, cy = GRID_X + cc * CELL + CELL // 2, GRID_Y + rr * CELL + CELL // 2
        pygame.draw.circle(screen, ROBOT, (cx, cy), CELL // 2 - 2)
        pygame.draw.circle(screen, (255, 255, 255), (cx, cy), CELL // 2 - 2, 2)

    draw_sidebar(screen, fonts, algo_name, result)


def draw_sidebar(screen, fonts, algo_name, result):
    pygame.draw.rect(screen, SIDEBAR, (SIDE_X, GRID_Y, SIDE_W, GRID_H), border_radius=12)
    pad = 18
    cx = SIDE_X + pad
    right = SIDE_X + SIDE_W - pad
    y = GRID_Y + 16

    screen.blit(fonts["title"].render("路径规划仿真器", True, SIDE_TEXT), (cx, y)); y += 30
    screen.blit(fonts["small"].render("移动机器人路径规划", True, SIDE_MUTE), (cx, y)); y += 22
    pygame.draw.line(screen, ACCENT, (cx, y), (right, y), 2); y += 16

    def header(text, yy):
        screen.blit(fonts["h"].render(text, True, ACCENT), (cx, yy))
        return yy + 24

    # 当前算法
    y = header("当前算法", y)
    screen.blit(fonts["body"].render(algo_name, True, SIDE_TEXT), (cx + 4, y)); y += 26

    # 运行结果
    y = header("运行结果", y)
    if result:
        def kv(k, v, vcolor=SIDE_TEXT):
            nonlocal y
            screen.blit(fonts["body"].render(k, True, SIDE_MUTE), (cx + 4, y))
            screen.blit(fonts["body"].render(v, True, vcolor), (cx + 96, y))
            y += 23
        kv("探索节点", str(result["expanded"]))
        kv("路径长度", str(result["cost"]) if result["found"] else "—")
        if result["found"]:
            kv("状态", "已找到", START)
        else:
            kv("状态", "无可行路径", GOAL)
        y += 4
    else:
        screen.blit(fonts["body"].render("按 空格 开始规划", True, ACCENT), (cx + 4, y)); y += 27

    # 图例
    y = header("图例", y)
    legend = [(START, "起点"), (GOAL, "终点"), (WALL, "障碍物"),
              (VISITED, "已探索"), (PATH, "最短路径"), (ROBOT, "机器人")]
    for color, label in legend:
        pygame.draw.rect(screen, color, (cx + 4, y + 2, 15, 15), border_radius=4)
        pygame.draw.rect(screen, SIDE_MUTE, (cx + 4, y + 2, 15, 15), 1, border_radius=4)  # 细边框，深色块也清晰
        screen.blit(fonts["body"].render(label, True, SIDE_TEXT), (cx + 28, y)); y += 22
    y += 6

    # 操作说明
    y = header("操作说明", y)
    controls = [
        "左键画障碍 · 右键擦除",
        "S / G + 点击：设起点 / 终点",
        "1 / 2 / 3：切换算法",
        "M：随机地图   空格：运行",
        "C：清除   R：重置   ESC：退出",
    ]
    for line in controls:
        screen.blit(fonts["small"].render(line, True, SIDE_MUTE), (cx + 4, y)); y += 19


def main():
    pygame.init()
    pygame.display.set_caption("移动机器人路径规划仿真器")
    screen = pygame.display.set_mode((WIN_W, WIN_H))
    clock = pygame.time.Clock()
    fonts = load_fonts()

    grid = empty_grid()
    start = (ROWS // 2, 3)
    goal = (ROWS // 2, COLS - 4)
    algo_key, algo_name = "astar", "A*（A 星）"

    result = None
    phase = None        # None / "search" / "path" / "done"
    anim_i = 0
    robot_i = 0
    frame = 0
    place_mode = None   # None / "start" / "goal"
    drawing = None      # None / "wall" / "erase"

    def cell_at(pos):
        mx, my = pos
        if mx < GRID_X or my < GRID_Y:
            return None
        c = (mx - GRID_X) // CELL
        r = (my - GRID_Y) // CELL
        if 0 <= r < ROWS and 0 <= c < COLS:
            return (r, c)
        return None

    def run_search():
        nonlocal result, phase, anim_i, robot_i, frame
        result = plan(grid, start, goal, algo_key)
        phase = "search"; anim_i = 0; robot_i = 0; frame = 0

    def clear_search():
        nonlocal result, phase, anim_i, robot_i
        result = None; phase = None; anim_i = 0; robot_i = 0

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    run_search()
                elif event.key == pygame.K_c:
                    clear_search()
                elif event.key == pygame.K_r:
                    grid = empty_grid(); clear_search()
                elif event.key == pygame.K_m:
                    grid = random_maze()
                    grid[start[0]][start[1]] = 0   # 保证起点、终点不被墙堵住
                    grid[goal[0]][goal[1]] = 0
                    clear_search()
                elif event.key == pygame.K_s:
                    place_mode = "start"
                elif event.key == pygame.K_g:
                    place_mode = "goal"
                elif event.key in ALGOS:
                    algo_key, algo_name = ALGOS[event.key]
                    if result:
                        run_search()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                cell = cell_at(event.pos)
                if cell:
                    if place_mode == "start":
                        if grid[cell[0]][cell[1]] == 0 and cell != goal:
                            start = cell; place_mode = None; clear_search()
                    elif place_mode == "goal":
                        if grid[cell[0]][cell[1]] == 0 and cell != start:
                            goal = cell; place_mode = None; clear_search()
                    elif event.button == 1:
                        drawing = "wall"
                    elif event.button == 3:
                        drawing = "erase"
            elif event.type == pygame.MOUSEBUTTONUP:
                drawing = None
            elif event.type == pygame.MOUSEMOTION:
                if drawing:
                    cell = cell_at(event.pos)
                    if cell and cell != start and cell != goal:
                        grid[cell[0]][cell[1]] = 1 if drawing == "wall" else 0

        # 动画推进
        frame += 1
        if phase == "search" and result:
            anim_i = min(anim_i + SEARCH_PER_FRAME, len(result["visited"]))
            if anim_i >= len(result["visited"]):
                phase = "path" if result["found"] else "done"; frame = 0
        elif phase == "path" and result:
            if frame % PATH_STEP_FRAMES == 0:
                robot_i = min(robot_i + 1, len(result["path"]) - 1)
                if robot_i >= len(result["path"]) - 1:
                    phase = "done"

        draw(screen, fonts, grid, start, goal, algo_name, result, phase, anim_i, robot_i)
        pygame.display.flip()
        clock.tick(FPS)

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
