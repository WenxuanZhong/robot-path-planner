"""
移动机器人路径规划 —— 核心算法模块
====================================
本模块与可视化界面（app.py）完全分离，好处是：
  1) 算法可以单独测试，证明它是对的（见 test_pathfinding.py）；
  2) 换界面、复用算法都很方便。
面试加分点：把“算法逻辑”和“显示逻辑”解耦，是工程上的好习惯。

实现了三种经典的栅格地图路径规划算法，它们的区别只有“优先级怎么算”这一行：
  - Dijkstra : 只看“已经走了多远”，保证最短，但搜得慢、范围大
  - A*       : “已走代价 + 到目标的估计”，既最短又高效（机器人导航主力算法）
  - Greedy   : 只看“到目标的估计”，跑得快但不保证最短（用来对比）

栅格地图约定：
  grid 是二维列表 grid[row][col]，0 = 可通行，1 = 障碍物。
  坐标统一用 (row, col) 表示。
"""

import heapq  # Python 自带的“最小堆”，用来每次取出优先级最高（数值最小）的格子

# 四方向移动：上、下、左、右。想支持斜着走，把下面 MOVES_8 传进去即可。
MOVES_4 = [(-1, 0), (1, 0), (0, -1), (0, 1)]
MOVES_8 = MOVES_4 + [(-1, -1), (-1, 1), (1, -1), (1, 1)]


def heuristic(a, b):
    """启发式函数 h：估计从 a 到 b 还要走多远。
    这里用“曼哈顿距离”（横向差 + 纵向差），它恰好匹配四方向网格，
    且永远不会高估真实距离 —— 这个性质叫“可采纳性”，是 A* 能找到最短路的关键。"""
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def neighbors(node, grid, moves=MOVES_4):
    """返回 node 四周所有“在地图内且不是障碍”的相邻格子。"""
    rows, cols = len(grid), len(grid[0])
    result = []
    for dr, dc in moves:
        r, c = node[0] + dr, node[1] + dc
        if 0 <= r < rows and 0 <= c < cols and grid[r][c] == 0:
            result.append((r, c))
    return result


def reconstruct_path(came_from, start, goal):
    """根据 came_from（记录“每个格子是从哪个格子走过来的”）反向回溯出完整路径。"""
    if goal not in came_from and goal != start:
        return []  # 没走到目标
    path = [goal]
    while path[-1] != start:
        path.append(came_from[path[-1]])
    path.reverse()  # 反过来，变成从起点到终点
    return path


def plan(grid, start, goal, algorithm="astar", moves=MOVES_4):
    """
    统一的路径规划入口。返回一个字典：
      {
        "path":     [...],   # 最终路径（格子列表），找不到则为空 []
        "visited":  [...],   # 按“被探索的先后顺序”记录的格子（给界面做动画用）
        "cost":     int,     # 路径长度（走了多少步）
        "expanded": int,     # 一共探索了多少个格子（数字越小说明算法越聪明/高效）
        "found":    bool,    # 是否找到了路径
      }
    """
    # 优先队列里存 (优先级, 计数器, 格子)。计数器用于优先级相同时保持先进先出，避免报错。
    open_heap = []
    counter = 0
    heapq.heappush(open_heap, (0, counter, start))

    came_from = {}            # 记录每个格子是从哪来的，用于最后回溯路径
    g_score = {start: 0}      # g：从起点到该格子的真实代价（已经走了多远）
    visited_order = []        # 探索顺序，用来播放搜索动画
    closed = set()            # 已经处理完、不需要再看的格子

    while open_heap:
        # 取出当前“优先级最高”（数值最小）的格子
        _, _, current = heapq.heappop(open_heap)
        if current in closed:
            continue          # 之前已经用更优方式处理过它了，跳过
        closed.add(current)
        visited_order.append(current)

        if current == goal:   # 到达目标，结束
            path = reconstruct_path(came_from, start, goal)
            return {
                "path": path,
                "visited": visited_order,
                "cost": len(path) - 1 if path else 0,
                "expanded": len(visited_order),
                "found": True,
            }

        for nxt in neighbors(current, grid, moves):
            tentative_g = g_score[current] + 1   # 每走一步代价记为 1
            # 如果这是第一次到 nxt，或者发现了一条更短的到 nxt 的路 —— 就更新它
            if nxt not in g_score or tentative_g < g_score[nxt]:
                g_score[nxt] = tentative_g
                came_from[nxt] = current
                # ↓↓↓ 三种算法唯一的区别就在这几行：优先级怎么定 ↓↓↓
                if algorithm == "dijkstra":
                    priority = tentative_g                          # 只看已走代价 g
                elif algorithm == "greedy":
                    priority = heuristic(nxt, goal)                 # 只看到目标估计 h
                else:  # astar
                    priority = tentative_g + heuristic(nxt, goal)   # f = g + h
                counter += 1
                heapq.heappush(open_heap, (priority, counter, nxt))

    # 队列空了还没到目标，说明此路不通
    return {
        "path": [],
        "visited": visited_order,
        "cost": 0,
        "expanded": len(visited_order),
        "found": False,
    }
