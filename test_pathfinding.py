"""
路径规划算法自测（不依赖 pygame，可直接运行：python test_pathfinding.py）
作用：用几个简单地图证明算法是对的。
面试时你可以说一句：“我给核心算法写了单元测试。” —— 这是工程素养的体现。
注意：打印用英文，避免中文 Windows 终端(GBK 编码)报错；中文说明都放在注释里。
"""
from pathfinding import plan


def make_grid(rows, cols, walls):
    """生成一张地图，walls 里的格子设为障碍。"""
    grid = [[0] * cols for _ in range(rows)]
    for (r, c) in walls:
        grid[r][c] = 1
    return grid


def test_straight_line():
    """空地图：起点到终点是一条直线，最短步数应等于曼哈顿距离 4。"""
    grid = make_grid(5, 5, [])
    res = plan(grid, (0, 0), (0, 4), "astar")
    assert res["found"] is True
    assert res["cost"] == 4, "expected 4, got %d" % res["cost"]
    print("[OK] empty-map straight line: cost =", res["cost"], " expanded =", res["expanded"])


def test_around_wall():
    """中间竖一堵墙（只在第 4 行有缺口），机器人必须绕到底部再上来。"""
    walls = [(0, 2), (1, 2), (2, 2), (3, 2)]   # 第 0~3 行的第 2 列是墙，第 4 行第 2 列是缺口
    grid = make_grid(5, 5, walls)
    res = plan(grid, (0, 0), (0, 4), "astar")
    assert res["found"] is True
    assert res["cost"] == 12, "expected 12, got %d" % res["cost"]
    print("[OK] detour around wall:     cost =", res["cost"], " expanded =", res["expanded"])


def test_no_path():
    """用墙把起点彻底围死，应该报告“无路可走”。"""
    walls = [(0, 1), (1, 1), (1, 0)]
    grid = make_grid(5, 5, walls)
    res = plan(grid, (0, 0), (4, 4), "astar")
    assert res["found"] is False
    assert res["path"] == []
    print("[OK] no path (blocked):      found =", res["found"])


def test_astar_not_worse_than_dijkstra():
    """A* 和 Dijkstra 都保证最短，所以两者算出的路径长度必须相等；
    在更大、更开阔的地图上，A* 通常探索更少的格子（更高效）。"""
    walls = [(1, 1), (2, 1), (3, 1), (1, 3), (2, 3)]
    grid = make_grid(6, 6, walls)
    a = plan(grid, (0, 0), (5, 5), "astar")
    d = plan(grid, (0, 0), (5, 5), "dijkstra")
    assert a["cost"] == d["cost"], "A* and Dijkstra must agree on shortest length"
    print("[OK] A* == Dijkstra shortest length: %d  |  expanded: A*=%d, Dijkstra=%d"
          % (a["cost"], a["expanded"], d["expanded"]))


if __name__ == "__main__":
    test_straight_line()
    test_around_wall()
    test_no_path()
    test_astar_not_worse_than_dijkstra()
    print("\nAll tests passed.")
