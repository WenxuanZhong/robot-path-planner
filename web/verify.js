/*
 * 移植正确性自测 —— 用 Node 运行：node web/verify.js
 * ===================================================
 * golden.json 里的期望值，是用 Python 版 pathfinding.py 跑出来的“标准答案”。
 * 这里用 JS 版 pathfinding.js 在同样的地图上重跑，逐项核对：
 *   found / cost / expanded / 完整 path / visited 长度
 * 全部一致，即证明 JS 移植与 Python 行为完全相同（连扩展顺序都一样）。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var PF = require('./pathfinding.js');

var golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
var ALGOS = ['astar', 'dijkstra', 'greedy'];

var fail = 0, checks = 0;

function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

golden.forEach(function (cse) {
  ALGOS.forEach(function (a) {
    var want = cse.algos[a];
    var got = PF.plan(cse.grid, cse.start, cse.goal, a);
    var problems = [];
    if (got.found !== want.found) problems.push('found ' + got.found + '≠' + want.found);
    if (got.cost !== want.cost) problems.push('cost ' + got.cost + '≠' + want.cost);
    if (got.expanded !== want.expanded) problems.push('expanded ' + got.expanded + '≠' + want.expanded);
    if (got.path.length !== want.pathLen) problems.push('pathLen ' + got.path.length + '≠' + want.pathLen);
    if (got.visited.length !== want.visitedLen) problems.push('visitedLen ' + got.visited.length + '≠' + want.visitedLen);
    if (!eq(got.path, want.path)) problems.push('path mismatch');
    checks++;
    var label = (cse.name + ' / ' + a).padEnd(28);
    if (problems.length) {
      fail++;
      console.log('[FAIL] ' + label + ' ' + problems.join('; '));
    } else {
      console.log('[OK]   ' + label + ' found=' + got.found + ' cost=' + got.cost + ' expanded=' + got.expanded);
    }
  });
});

console.log('\n' + (fail === 0 ? 'All ' + checks + ' cross-checks passed — JS port matches Python exactly.'
                              : fail + '/' + checks + ' checks FAILED.'));
process.exit(fail === 0 ? 0 : 1);
