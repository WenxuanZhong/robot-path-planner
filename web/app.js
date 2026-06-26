/*
 * 移动机器人路径规划仿真器 —— 浏览器前端
 * ==========================================
 * 用 HTML Canvas 把 pathfinding.js 的算法“画”出来：
 * 画障碍 → 运行 → 看搜索边界(开集) / 已探索(闭集)扩散 → 最短路径 → 机器人走过去。
 * 与算法完全解耦：本文件只负责“显示与交互”，算法在 pathfinding.js 里。
 */
(function () {
  'use strict';

  var PF = window.Pathfinding;

  // ---------------- 可调参数 ----------------
  var ROWS = 20, COLS = 34, CELL = 24;     // 栅格行列与单格内部像素
  var DEFAULT_START = [10, 5];
  var DEFAULT_GOAL = [10, 28];

  // ---------------- 配色（与 styles.css 的图例一致）----------------
  var COLORS = {
    bg: '#ffffff',
    grid: '#eef2f7',
    wall: '#1e293b',
    start: '#22c55e',
    goal: '#ef4444',
    visited: '#bfdbfe',   // 闭集：已探索
    frontier: '#6366f1',  // 开集：搜索边界
    path: '#f59e0b',
    robot: '#7c3aed'
  };

  var ALGO_NAMES = { astar: 'A*', dijkstra: 'Dijkstra', greedy: '贪婪最佳优先' };

  // ---------------- DOM ----------------
  var canvas = document.getElementById('grid');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');
  var algoSeg = document.getElementById('algoSeg');
  var toolSeg = document.getElementById('toolSeg');
  var speedEl = document.getElementById('speed');
  var runBtn = document.getElementById('run');
  var mAlgo = document.getElementById('mAlgo');
  var mStatus = document.getElementById('mStatus');
  var mLen = document.getElementById('mLen');
  var mExpanded = document.getElementById('mExpanded');
  var mTime = document.getElementById('mTime');

  // ---------------- 状态 ----------------
  var grid = emptyGrid();
  var start = DEFAULT_START.slice();
  var goal = DEFAULT_GOAL.slice();
  var algo = 'astar';
  var tool = 'wall';

  var result = null;                 // plan() 的返回
  var planMs = 0;                    // 规划耗时
  var phase = 'idle';                // idle | search | path | done
  var revealed = 0;                  // 已显示多少个 visited
  var robotPos = 0;                  // 机器人在路径上的浮点位置（用于平滑滑动）
  var closedSet = new Set();         // 已探索（闭集）
  var frontierSet = new Set();       // 搜索边界（开集）—— 仅由 visited 顺序推导
  var rafId = null;
  var paused = false;

  var pointerActive = false;
  var paintValue = null;             // 1=画墙 0=擦除（拖动时固定）

  // ---------------- 栅格工具 ----------------
  function emptyGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) { g.push(new Array(COLS).fill(0)); }
    return g;
  }
  function key(r, c) { return r + ',' + c; }
  function sameCell(a, b) { return a[0] === b[0] && a[1] === b[1]; }

  // 简单可重复的伪随机数（避免依赖会被环境禁用的全局随机源）
  var seed = 123456789;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  function randomMaze(density) {
    for (var attempt = 0; attempt < 16; attempt++) {
      var g = [];
      for (var r = 0; r < ROWS; r++) {
        var row = [];
        for (var c = 0; c < COLS; c++) row.push(rnd() < density ? 1 : 0);
        g.push(row);
      }
      g[start[0]][start[1]] = 0;
      g[goal[0]][goal[1]] = 0;
      if (PF.plan(g, start, goal, 'astar').found) return g;
    }
    // 兜底：挖一条直通道，保证一定有解
    var g2 = emptyGrid();
    return g2;
  }

  // ---------------- Canvas 尺寸（高清屏锐利）----------------
  function setupCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = COLS * CELL * dpr;
    canvas.height = ROWS * CELL * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundRect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillCell(r, c, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
  }

  // ---------------- 渲染 ----------------
  function render() {
    var W = COLS * CELL, H = ROWS * CELL;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // 已探索（闭集）
    if (result) {
      closedSet.forEach(function (k) {
        var p = k.split(','); fillCell(+p[0], +p[1], COLORS.visited);
      });
      // 搜索边界（开集）
      frontierSet.forEach(function (k) {
        if (closedSet.has(k)) return;
        var p = k.split(','); fillCell(+p[0], +p[1], COLORS.frontier);
      });
    }

    // 障碍
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++)
        if (grid[r][c] === 1) fillCell(r, c, COLORS.wall);

    // 路径（随机器人逐格显现）
    if (result && result.found && (phase === 'path' || phase === 'done')) {
      var upto = phase === 'done' ? result.path.length : Math.min(Math.floor(robotPos) + 2, result.path.length);
      for (var i = 0; i < upto; i++) {
        var pc = result.path[i];
        if (!sameCell(pc, start) && !sameCell(pc, goal)) fillCell(pc[0], pc[1], COLORS.path);
      }
    }

    // 网格线
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gr = 0; gr <= ROWS; gr++) { ctx.moveTo(0, gr * CELL + 0.5); ctx.lineTo(W, gr * CELL + 0.5); }
    for (var gc = 0; gc <= COLS; gc++) { ctx.moveTo(gc * CELL + 0.5, 0); ctx.lineTo(gc * CELL + 0.5, H); }
    ctx.stroke();

    drawStart();
    drawGoal();
    drawRobot();
  }

  function drawStart() {
    var x = start[1] * CELL, y = start[0] * CELL;
    ctx.fillStyle = COLORS.start;
    roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.16, 0, Math.PI * 2); ctx.fill();
  }

  function drawGoal() {
    var x = goal[1] * CELL, y = goal[0] * CELL;
    ctx.fillStyle = COLORS.goal;
    roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.2, 0, Math.PI * 2); ctx.stroke();
  }

  function drawRobot() {
    if (!result || !result.found || result.path.length === 0) return;
    if (phase !== 'path' && phase !== 'done') return;
    var i0 = Math.floor(robotPos);
    var i1 = Math.min(i0 + 1, result.path.length - 1);
    var frac = robotPos - i0;
    var a = result.path[i0], b = result.path[i1];
    var rr = a[0] + (b[0] - a[0]) * frac;
    var cc = a[1] + (b[1] - a[1]) * frac;
    var x = cc * CELL + CELL / 2, y = rr * CELL + CELL / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(124,58,237,.45)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.robot;
    ctx.beginPath(); ctx.arc(x, y, CELL * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(x - CELL * 0.1, y - CELL * 0.1, CELL * 0.1, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------- 搜索动画：由 visited 顺序增量推导 开集/闭集 ----------------
  function revealUpTo(n) {
    while (revealed < n && revealed < result.visited.length) {
      var cell = result.visited[revealed];
      var k = key(cell[0], cell[1]);
      frontierSet.delete(k);
      closedSet.add(k);
      // 该格被“展开”后，其可通行邻居进入搜索边界（开集）
      var moves = PF.MOVES_4;
      for (var m = 0; m < moves.length; m++) {
        var nr = cell[0] + moves[m][0], nc = cell[1] + moves[m][1];
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (grid[nr][nc] !== 0) continue;
        var nk = key(nr, nc);
        if (!closedSet.has(nk)) frontierSet.add(nk);
      }
      revealed++;
    }
  }

  // ---------------- 运行 / 动画循环 ----------------
  function computePlan() {
    var t0 = performance.now();
    result = PF.plan(grid, start, goal, algo);
    planMs = performance.now() - t0;
    revealed = 0; robotPos = 0;
    closedSet = new Set(); frontierSet = new Set();
  }

  function run() {
    computePlan();
    phase = 'search';
    paused = false;
    setStatus('searching');
    updateMetrics();
    startLoop();
  }

  function loop() {
    tick();
    render();
    updateMetrics();
    if (phase === 'search' || phase === 'path') {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      syncRunButton();          // 动画自然结束后，把按钮恢复成「▶ 运行」
    }
  }
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }
  function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function tick() {
    var speed = +speedEl.value;
    if (phase === 'search') {
      var perFrame = Math.max(1, Math.round(speed * 1.6));
      revealUpTo(Math.min(revealed + perFrame, result.visited.length));
      if (revealed >= result.visited.length) {
      if (result.found) { phase = 'path'; robotPos = 0; }
      else { phase = 'done'; setStatus('fail'); }
      }
    } else if (phase === 'path') {
      var step = 0.04 + speed * 0.045;
      robotPos += step;
      if (robotPos >= result.path.length - 1) {
        robotPos = result.path.length - 1;
        phase = 'done';
        setStatus('found');
      }
    }
  }

  // 单步（教学用）：不连续动画，每次前进一格
  function stepOnce() {
    stopLoop(); paused = false;
    if (phase === 'idle') { computePlan(); phase = 'search'; }
    if (phase === 'search') {
      revealUpTo(Math.min(revealed + 1, result.visited.length));
      setStatus('searching');
      if (revealed >= result.visited.length) {
        if (result.found) { phase = 'path'; robotPos = 0; }
        else { phase = 'done'; setStatus('fail'); }
      }
    } else if (phase === 'path') {
      robotPos = Math.min(robotPos + 1, result.path.length - 1);
      if (robotPos >= result.path.length - 1) { phase = 'done'; setStatus('found'); }
    }
    render(); updateMetrics();
  }

  function clearSearch() {
    stopLoop();
    result = null; phase = 'idle'; paused = false;
    revealed = 0; robotPos = 0;
    closedSet = new Set(); frontierSet = new Set();
    setStatus('idle'); updateMetrics(); render();
  }

  // ---------------- 文案 / 指标 ----------------
  function setStatus(kind) {
    statusEl.classList.remove('is-found', 'is-fail');
    if (kind === 'idle') {
      statusEl.textContent = '在网格上画障碍，然后点「运行」看机器人规划最短路径。';
    } else if (kind === 'searching') {
      statusEl.textContent = '正在搜索……当前使用「' + ALGO_NAMES[algo] + '」，一格一格扩展，寻找通往终点的最短路径。';
    } else if (kind === 'found') {
      statusEl.classList.add('is-found');
      statusEl.textContent = '✅ 已找到最短路径：共 ' + result.cost + ' 步，探索了 ' + result.expanded + ' 个格子。';
    } else if (kind === 'fail') {
      statusEl.classList.add('is-fail');
      statusEl.textContent = '🚧 起点和终点之间被完全挡住，无法到达。试试擦掉一些障碍。';
    }
  }

  function updateMetrics() {
    mAlgo.textContent = ALGO_NAMES[algo];
    if (!result) {
      mStatus.textContent = '就绪'; mLen.textContent = '—';
      mExpanded.textContent = '—'; mTime.textContent = '—';
      return;
    }
    if (phase === 'search') mStatus.textContent = paused ? '已暂停' : '搜索中';
    else if (phase === 'path') mStatus.textContent = paused ? '已暂停' : '行走中';
    else mStatus.textContent = result.found ? '已找到' : '无路径';

    mLen.textContent = result.found ? result.cost : '∞';
    // 搜索阶段让“探索节点”实时跳动，最终显示总数
    mExpanded.textContent = (phase === 'search') ? revealed : result.expanded;
    mTime.textContent = (planMs < 1 ? planMs.toFixed(2) : planMs.toFixed(1)) + ' ms';
  }

  // ---------------- 算法对比 ----------------
  function runCompare() {
    var wrap = document.getElementById('compareWrap');
    var body = document.getElementById('compareBody');
    var note = document.getElementById('compareNote');
    var order = ['astar', 'dijkstra', 'greedy'];
    var rows = order.map(function (a) {
      var res = PF.plan(grid, start, goal, a);
      return { algo: a, found: res.found, cost: res.cost, expanded: res.expanded };
    });

    var foundRows = rows.filter(function (x) { return x.found; });
    var minCost = foundRows.length ? Math.min.apply(null, foundRows.map(function (x) { return x.cost; })) : 0;
    var optimalRows = foundRows.filter(function (x) { return x.cost === minCost; });
    var bestExpanded = optimalRows.length ? Math.min.apply(null, optimalRows.map(function (x) { return x.expanded; })) : 0;

    body.innerHTML = '';
    rows.forEach(function (x) {
      var tr = document.createElement('tr');
      var optimal = x.found && x.cost === minCost;
      var isBest = optimal && x.expanded === bestExpanded;
      if (isBest) tr.className = 'is-best';
      var tag = !x.found ? '' :
        (optimal ? '<span class="tag tag-opt">最短</span>' : '<span class="tag tag-sub">偏长</span>');
      tr.innerHTML =
        '<td>' + ALGO_NAMES[x.algo] + tag + '</td>' +
        '<td>' + (x.found ? x.cost : '∞') + '</td>' +
        '<td>' + x.expanded + '</td>';
      body.appendChild(tr);
    });

    // 动态解说：用真实数字讲清“为什么 A* 又快又准”
    var astar = rows[0], dij = rows[1], greedy = rows[2];
      var msg = '';
    if (astar.found && dij.found) {
      var ratio = (dij.expanded / Math.max(1, astar.expanded));
      msg += 'A* 和 Dijkstra 都找到了最短路径（' + minCost + ' 步），但 A* 只探索了 ' +
        astar.expanded + ' 个节点，约为 Dijkstra（' + dij.expanded + '）的 1/' + ratio.toFixed(1) +
        '。启发式让它更像“朝着终点”去搜，所以更高效。';
    }
    if (greedy.found) {
      msg += ' 贪婪最佳优先只探索 ' + greedy.expanded + ' 个节点最快，但路径是 ' + greedy.cost + ' 步' +
        (greedy.cost > minCost ? '，比最短路径更长。' : '。');
    }
    note.textContent = msg;
    wrap.hidden = false;
  }

  // ---------------- 交互：指针（鼠标 + 触屏统一）----------------
  function cellFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var c = Math.floor((e.clientX - rect.left) / (rect.width / COLS));
    var r = Math.floor((e.clientY - rect.top) / (rect.height / ROWS));
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return [r, c];
  }

  function applyToolAt(cell, rightButton) {
    if (!cell) return;
    var t = rightButton ? 'erase' : tool;
    if (t === 'start') {
      if (grid[cell[0]][cell[1]] === 0 && !sameCell(cell, goal)) { start = cell.slice(); clearSearch(); }
    } else if (t === 'goal') {
      if (grid[cell[0]][cell[1]] === 0 && !sameCell(cell, start)) { goal = cell.slice(); clearSearch(); }
    } else { // wall / erase
      if (sameCell(cell, start) || sameCell(cell, goal)) return;
      var v = (t === 'erase') ? 0 : (paintValue != null ? paintValue : 1);
      if (grid[cell[0]][cell[1]] !== v) {
        grid[cell[0]][cell[1]] = v;
        if (result) clearSearch(); else render();
      }
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    pointerActive = true;
    var right = (e.button === 2);
    var cell = cellFromEvent(e);
    if (!right && (tool === 'wall' || tool === 'erase') && cell) {
      // 起手决定整次拖动是“画”还是“擦”
      paintValue = (tool === 'erase') ? 0 : 1;
    } else { paintValue = null; }
    applyToolAt(cell, right);
  }

  function onPointerMove(e) {
    if (!pointerActive) return;
    var right = (e.buttons & 2) === 2;
    applyToolAt(cellFromEvent(e), right);
  }

  function onPointerUp(e) {
    pointerActive = false; paintValue = null;
    try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 未捕获则忽略 */ }
  }

  // ---------------- 控件绑定 ----------------
  function setActive(container, attr, val) {
    container.querySelectorAll('button').forEach(function (b) {
      var on = b.getAttribute(attr) === val;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setAlgo(a) {
    algo = a;
    setActive(algoSeg, 'data-algo', a);
    mAlgo.textContent = ALGO_NAMES[a];
    if (phase !== 'idle') run();      // 已有地图就用新算法立即重跑，方便对比
    else updateMetrics();
  }

  function setTool(t) { tool = t; setActive(toolSeg, 'data-tool', t); }

  function toggleRun() {
    if (phase === 'idle' || phase === 'done') { run(); return; }
    if (rafId) {                       // 正在动画 -> 暂停
      stopLoop(); paused = true; updateMetrics();
      runBtn.textContent = '▶ 继续';
    } else {                           // 已暂停 -> 继续
      paused = false; runBtn.textContent = '⏸ 暂停';
      startLoop();
    }
  }

  function syncRunButton() {
    if (phase === 'search' || phase === 'path') runBtn.textContent = paused ? '▶ 继续' : '⏸ 暂停';
    else runBtn.textContent = '▶ 运行';
  }

  algoSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) setAlgo(b.getAttribute('data-algo'));
  });
  toolSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) setTool(b.getAttribute('data-tool'));
  });
  runBtn.addEventListener('click', function () { toggleRun(); syncRunButton(); });
  document.getElementById('step').addEventListener('click', function () { stepOnce(); syncRunButton(); });
  document.getElementById('clearPath').addEventListener('click', function () { clearSearch(); syncRunButton(); });
  document.getElementById('reset').addEventListener('click', function () {
    grid = emptyGrid(); start = DEFAULT_START.slice(); goal = DEFAULT_GOAL.slice();
    clearSearch(); document.getElementById('compareWrap').hidden = true; syncRunButton();
  });
  document.getElementById('maze').addEventListener('click', function () {
    grid = randomMaze(0.25); clearSearch(); syncRunButton();
  });
  document.getElementById('compareBtn').addEventListener('click', runCompare);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // 键盘快捷键
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === '1') setAlgo('astar');
    else if (k === '2') setAlgo('dijkstra');
    else if (k === '3') setAlgo('greedy');
    else if (k === ' ') { e.preventDefault(); toggleRun(); }
    else if (k === 's') setTool('start');
    else if (k === 'g') setTool('goal');
    else if (k === 'c') clearSearch();
    else if (k === 'r') { grid = emptyGrid(); start = DEFAULT_START.slice(); goal = DEFAULT_GOAL.slice(); clearSearch(); }
    else if (k === 'm') { grid = randomMaze(0.25); clearSearch(); }
    syncRunButton();
  });

  window.addEventListener('resize', function () { render(); });

  // ---------------- 启动：放一张可解的地图并自动演示一次 ----------------
  function init() {
    setupCanvas();
    setActive(algoSeg, 'data-algo', algo);
    setActive(toolSeg, 'data-tool', tool);
    grid = randomMaze(0.22);
    render();
    updateMetrics();
    // 稍候自动跑一次 A*，让访客一打开就看到动画
    setTimeout(function () {
      if (phase === 'idle') { run(); syncRunButton(); }
    }, 700);
  }

  init();
})();
