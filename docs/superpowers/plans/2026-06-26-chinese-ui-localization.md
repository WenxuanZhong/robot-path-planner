# 中文界面本地化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把网页端和 pygame 桌面端的所有可见界面文案统一改成中文，同时保留路径规划算法与交互逻辑不变。

**Architecture:** 只改界面文案层，不碰核心路径规划实现。网页端由 `web/index.html` 提供静态文案，`web/app.js` 提供动态状态与对比文案；桌面端由 `app.py` 提供所有窗口文案。若中文变长导致换行拥挤，再补最小 CSS 调整。

**Tech Stack:** HTML / CSS / 原生 JavaScript / Python / pygame

## Global Constraints

- 算法名与行为保持不变：A* / Dijkstra / 贪婪最佳优先仍然可切换，路径规划结果不改。
- 不新增依赖，不改安装方式。
- 键盘快捷键、鼠标交互、动画节奏保持不变。

---

### Task 1: 网页端中文化

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css` (only if需要修复换行/宽度)
- Test: `test_ui_localization.py`

**Interfaces:**
- Consumes: 现有页面结构、`Pathfinding.plan()` 返回值
- Produces: 中文化后的网页标题、按钮、说明、状态、对比文案

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def test_web_ui_uses_chinese_copy():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "web" / "app.js").read_text(encoding="utf-8")

    assert "Mobile Robot Path Planning" not in html
    assert "Obstacle-Avoidance Simulator" not in html
    assert "贪婪 Greedy" not in js
    assert "移动机器人路径规划仿真器" in html
    assert "贪婪最佳优先" in js
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python test_ui_localization.py`
Expected: FAIL with assertions for the current English UI strings.

- [ ] **Step 3: Write minimal implementation**

Update `web/index.html` and `web/app.js` so every visible label, subtitle, status line, and compare note is Chinese. If any line wraps badly, add the smallest CSS tweak in `web/styles.css`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python test_ui_localization.py`
Expected: PASS

---

### Task 2: 桌面端中文化

**Files:**
- Modify: `app.py`
- Test: `test_ui_localization.py`

**Interfaces:**
- Consumes: pygame window strings, sidebar labels, status text
- Produces: 中文化后的桌面端标题、副标题、说明与结果文案

- [ ] **Step 1: Extend the failing test**

```python
def test_desktop_ui_uses_chinese_copy():
    app = (ROOT / "app.py").read_text(encoding="utf-8")

    assert "Mobile Robot Path Planning" not in app
    assert "路径规划仿真器" in app
    assert "当前算法" in app
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python test_ui_localization.py`
Expected: FAIL because the desktop subtitle is still English.

- [ ] **Step 3: Write minimal implementation**

Translate the pygame sidebar subtitle and any remaining visible English copy in `app.py` to Chinese. Keep algorithm names, shortcuts, and behavior unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `python test_ui_localization.py`
Expected: PASS

---

### Task 3: 运行验证与推送

**Files:**
- Modify: none unless git metadata is missing

**Interfaces:**
- Consumes: the localized UI files
- Produces: a clean push to the GitHub repository once authentication exists

- [ ] **Step 1: Run runtime checks**

Run:
```bash
python test_pathfinding.py
node web/verify.js
python test_ui_localization.py
```
Expected: all commands exit 0.

- [ ] **Step 2: Initialize git if needed, commit, and push**

Run:
```bash
git init
git remote add origin https://github.com/WenxuanZhong/robot-path-planner.git
git add .
git commit -m "feat: chinese ui localization"
git push -u origin main
```
Expected: commit succeeds; push succeeds after GitHub authentication is available.

