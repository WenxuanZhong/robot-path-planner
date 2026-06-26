from pathlib import Path


ROOT = Path(__file__).resolve().parent


def read(relpath: str) -> str:
    return (ROOT / relpath).read_text(encoding="utf-8")


def test_web_ui_uses_chinese_copy():
    html = read("web/index.html")
    js = read("web/app.js")

    assert "Mobile Robot Path Planning" not in html
    assert "Obstacle-Avoidance Simulator" not in html
    assert "贪婪 Greedy" not in js
    assert "移动机器人路径规划仿真器" in html
    assert "贪婪最佳优先" in js


def test_desktop_ui_uses_chinese_copy():
    app = read("app.py")

    assert "Mobile Robot Path Planning" not in app
    assert "路径规划仿真器" in app
    assert "当前算法" in app


if __name__ == "__main__":
    test_web_ui_uses_chinese_copy()
    test_desktop_ui_uses_chinese_copy()
    print("UI localization checks passed.")
