/*
 * 路径规划算法 —— pathfinding.py 的忠实 JavaScript 移植
 * ======================================================
 * 与界面（app.js）完全解耦：算法可单独加载、单独测试（见 verify.js，
 * 用 Node 跑出的结果与 Python 版逐格对比，证明移植正确）。
 *
 * 栅格约定：grid[row][col]，0 = 可通行，1 = 障碍物；坐标统一用 [row, col]。
 * 三种算法的唯一区别，就是“优先级”怎么算：
 *   - Dijkstra : f = g            （只看已走代价，最短但搜得多）
 *   - A*       : f = g + h        （已走代价 + 启发式估计，又快又最短）
 *   - Greedy   : f = h            （只看到目标估计，快但不保证最短）
 */
(function (global) {
  'use strict';

  // 四方向移动：上、下、左、右（与 Python MOVES_4 顺序一致，保证行为可复现）
  var MOVES_4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var MOVES_8 = MOVES_4.concat([[-1, -1], [-1, 1], [1, -1], [1, 1]]);

  // 曼哈顿距离启发式：永不高估真实距离（可采纳），是 A* 找到最短路的关键
  function heuristic(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  }

  function cellKey(r, c) { return r + ',' + c; }

  /*
   * 二叉最小堆，按 [priority, counter] 字典序比较。
   * counter 是入堆序号（始终唯一、递增）：优先级相同时先进先出，
   * 这与 Python heapq 对元组 (priority, counter, node) 的比较完全一致，
   * 因此本移植的 expanded 数、visited 顺序都与 Python 版逐格相同。
   */
  function MinHeap() { this.a = []; }
  MinHeap.prototype.size = function () { return this.a.length; };
  MinHeap.prototype._less = function (x, y) {
    if (x[0] !== y[0]) return x[0] < y[0];
    return x[1] < y[1];
  };
  MinHeap.prototype.push = function (item) {
    var a = this.a; a.push(item); var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this._less(a[i], a[p])) { var t = a[i]; a[i] = a[p]; a[p] = t; i = p; }
      else break;
    }
  };
  MinHeap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; this._down(0); }
    return top;
  };
  MinHeap.prototype._down = function (i) {
    var a = this.a, n = a.length;
    for (;;) {
      var l = 2 * i + 1, r = 2 * i + 2, m = i;
      if (l < n && this._less(a[l], a[m])) m = l;
      if (r < n && this._less(a[r], a[m])) m = r;
      if (m === i) break;
      var t = a[i]; a[i] = a[m]; a[m] = t; i = m;
    }
  };

  // 返回 node 四周“在界内且非障碍”的邻居
  function neighbors(node, grid, moves) {
    var rows = grid.length, cols = grid[0].length, res = [];
    for (var k = 0; k < moves.length; k++) {
      var r = node[0] + moves[k][0], c = node[1] + moves[k][1];
      if (r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === 0) res.push([r, c]);
    }
    return res;
  }

  // 根据 cameFrom（每格是从哪来的）反向回溯出完整路径
  function reconstructPath(cameFrom, start, goal) {
    var sk = cellKey(start[0], start[1]), gk = cellKey(goal[0], goal[1]);
    if (!cameFrom.has(gk) && gk !== sk) return [];
    var path = [goal], curk = gk;
    while (curk !== sk) {
      var prev = cameFrom.get(curk);
      path.push(prev);
      curk = cellKey(prev[0], prev[1]);
    }
    path.reverse();
    return path;
  }

  /*
   * 统一入口。返回：
   *   { path, visited, cost, expanded, found }
   * path     : 最终路径（格子数组），找不到为 []
   * visited  : 按探索先后记录的格子（界面用来播放搜索动画）
   * cost     : 路径步数
   * expanded : 共扩展（探索）了多少格 —— 数字越小越高效
   * found    : 是否找到路径
   */
  function plan(grid, start, goal, algorithm, moves) {
    moves = moves || MOVES_4;
    var open = new MinHeap(), counter = 0;
    open.push([0, counter, start]);

    var cameFrom = new Map();          // key -> [r,c]
    var gScore = new Map();            // key -> 从起点到该格的真实代价 g
    gScore.set(cellKey(start[0], start[1]), 0);
    var visitedOrder = [];
    var closed = new Set();
    var gk = cellKey(goal[0], goal[1]);

    while (open.size()) {
      var current = open.pop()[2];
      var ck = cellKey(current[0], current[1]);
      if (closed.has(ck)) continue;     // 之前已用更优方式处理过
      closed.add(ck);
      visitedOrder.push(current);

      if (ck === gk) {
        var path = reconstructPath(cameFrom, start, goal);
        return {
          path: path,
          visited: visitedOrder,
          cost: path.length ? path.length - 1 : 0,
          expanded: visitedOrder.length,
          found: true
        };
      }

      var nbrs = neighbors(current, grid, moves);
      var gCur = gScore.get(ck);
      for (var i = 0; i < nbrs.length; i++) {
        var nxt = nbrs[i], nk = cellKey(nxt[0], nxt[1]);
        var tentativeG = gCur + 1;       // 每走一步代价为 1
        if (!gScore.has(nk) || tentativeG < gScore.get(nk)) {
          gScore.set(nk, tentativeG);
          cameFrom.set(nk, current);
          var priority;
          // ↓↓↓ 三种算法唯一的区别就在这里 ↓↓↓
          if (algorithm === 'dijkstra') priority = tentativeG;
          else if (algorithm === 'greedy') priority = heuristic(nxt, goal);
          else priority = tentativeG + heuristic(nxt, goal); // astar
          counter += 1;
          open.push([priority, counter, nxt]);
        }
      }
    }

    // 队列空了仍未到目标 —— 此路不通
    return { path: [], visited: visitedOrder, cost: 0, expanded: visitedOrder.length, found: false };
  }

  var api = { plan: plan, heuristic: heuristic, neighbors: neighbors, MOVES_4: MOVES_4, MOVES_8: MOVES_8 };

  // 浏览器：挂到 window.Pathfinding；Node：同时支持 module.exports（给 verify.js 用）
  global.Pathfinding = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
