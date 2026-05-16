#!/usr/bin/env python3
"""
一键刷新驾驶舱数据并可选发布到 GitHub Pages（gh-pages）。

典型用法（本机，读取桌面「日数据」）：
  python3 scripts/refresh_dashboard.py

仅重建、不推送：
  python3 scripts/refresh_dashboard.py --no-publish

自定义数据源（复制 dashboard.config.example.json → dashboard.config.json）：
  python3 scripts/refresh_dashboard.py --config dashboard.config.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_NAME = "dashboard.config.json"
EXAMPLE_NAME = "dashboard.config.example.json"


def find_python() -> str:
    for candidate in (
        os.environ.get("TTL_PYTHON"),
        "/opt/anaconda3/bin/python3",
        shutil.which("python3"),
    ):
        if candidate and Path(candidate).exists():
            return candidate
    return sys.executable


def load_config(path: Path | None) -> dict:
    candidates = [path] if path else []
    candidates.extend([ROOT / CONFIG_NAME, ROOT / EXAMPLE_NAME])
    for p in candidates:
        if p and p.is_file():
            return json.loads(p.read_text(encoding="utf-8"))
    return {}


def resolve_paths(cfg: dict) -> tuple[Path, Path, Path, Path, str | None]:
    ci = os.environ.get("GITHUB_ACTIONS") == "true" or cfg.get("useCiPaths")
    if ci:
        shipment = Path(cfg.get("shipmentSourceDirCI", "data/shipment")).expanduser()
        traffic = Path(cfg.get("trafficSourceDirCI", "data/traffic")).expanduser()
    else:
        shipment = Path(
            cfg.get("shipmentSourceDir")
            or os.environ.get("TTL_DASHBOARD_SOURCE_DIR")
            or str(Path.home() / "Desktop" / "日数据"),
        ).expanduser()
        traffic = Path(
            cfg.get("trafficSourceDir")
            or os.environ.get("TRAFFIC_DATA_DIR")
            or str(Path.home() / "Desktop" / "日数据" / "流量"),
        ).expanduser()

    out_bundle = Path(cfg.get("outputDataBundle", "data-bundle.js"))
    out_traffic = Path(cfg.get("outputTrafficJson", "data/traffic_daily.json"))
    mirror = cfg.get("mirrorSubdir")
    return shipment, traffic, ROOT / out_bundle, ROOT / out_traffic, mirror


def git_author_env(cfg: dict | None = None) -> dict:
    """不修改 git config，仅用环境变量满足 commit 作者要求。"""
    cfg = cfg or {}
    name = os.environ.get("GIT_AUTHOR_NAME") or cfg.get("gitAuthorName") or "TTL Dashboard"
    email = os.environ.get("GIT_AUTHOR_EMAIL") or cfg.get("gitAuthorEmail") or "dashboard@local"
    return {
        "GIT_AUTHOR_NAME": name,
        "GIT_AUTHOR_EMAIL": email,
        "GIT_COMMITTER_NAME": os.environ.get("GIT_COMMITTER_NAME", name),
        "GIT_COMMITTER_EMAIL": os.environ.get("GIT_COMMITTER_EMAIL", email),
    }


def run(cmd: list[str], env: dict | None = None) -> None:
    print("$", " ".join(cmd))
    merged = os.environ.copy()
    if env:
        merged.update(env)
    subprocess.run(cmd, cwd=ROOT, check=True, env=merged)


def run_git(cmd: list[str], cfg: dict) -> None:
    run(cmd, env=git_author_env(cfg))


def bump_cache_version(cfg: dict) -> str:
    if not cfg.get("bumpCacheOnRefresh", True):
        return ""
    stamp = datetime.now().strftime("%Y%m%d%H")
    tag = f"v={stamp}"
    targets = [ROOT / "index.html"]
    mirror = cfg.get("mirrorSubdir")
    if mirror:
        targets.append(ROOT / mirror / "index.html")
    for path in targets:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        text = re.sub(r"\?v=[\w]+", f"?{tag}", text)
        path.write_text(text, encoding="utf-8")
    print(f"缓存版本已更新为 ?{tag}")
    return stamp


def mirror_outputs(cfg: dict, bundle: Path, traffic: Path) -> None:
    mirror = cfg.get("mirrorSubdir")
    if not mirror:
        return
    dest = ROOT / mirror
    if not dest.is_dir():
        return
    shutil.copy2(bundle, dest / bundle.name)
    shutil.copy2(traffic, dest / traffic.relative_to(ROOT))
    for name in ("merged-daily-data.js", "traffic-data.js", "script.js", "ttl-traffic-panel.js"):
        src = ROOT / name
        if src.is_file():
            shutil.copy2(src, dest / name)


def git_publish(cfg: dict, stamp: str) -> None:
    msg = cfg.get("commitMessage") or f"data: 自动刷新 {stamp or datetime.now().strftime('%Y-%m-%d %H:%M')}"
    files = [
        "data-bundle.js",
        "data/traffic_daily.json",
        "index.html",
    ]
    mirror = cfg.get("mirrorSubdir")
    if mirror:
        files.extend(
            [
                f"{mirror}/data-bundle.js",
                f"{mirror}/data/traffic_daily.json",
                f"{mirror}/index.html",
            ],
        )

    run_git(["git", "add", *files], cfg)
    status = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=ROOT,
        env={**os.environ.copy(), **git_author_env(cfg)},
    )
    if status.returncode == 0:
        print("无数据变更，跳过提交。")
        return

    run_git(["git", "commit", "-m", msg], cfg)
    run_git(["git", "push", "origin", "main"], cfg)
    run_git(["git", "checkout", "gh-pages"], cfg)
    run_git(["git", "reset", "--hard", "main"], cfg)
    run_git(["git", "push", "origin", "gh-pages", "--force"], cfg)
    run_git(["git", "checkout", "main"], cfg)
    print("已推送到 main 与 gh-pages，约 1～3 分钟后线上生效。")


def main() -> None:
    parser = argparse.ArgumentParser(description="刷新太太乐驾驶舱数据包并可选发布")
    parser.add_argument("--config", type=Path, default=None, help="配置文件路径")
    parser.add_argument("--no-publish", action="store_true", help="只重建数据，不 git push")
    parser.add_argument("--no-bump-cache", action="store_true", help="不更新 index.html 缓存参数")
    args = parser.parse_args()

    cfg = load_config(args.config)
    shipment_dir, traffic_dir, out_bundle, out_traffic, _mirror = resolve_paths(cfg)

    if not shipment_dir.is_dir():
        raise SystemExit(
            f"出货数据目录不存在: {shipment_dir}\n"
            "请把 CSV 放在该目录，或编辑 dashboard.config.json 中的 shipmentSourceDir。",
        )
    if not traffic_dir.is_dir():
        print(f"警告: 流量目录不存在 {traffic_dir}，将写出空 traffic_daily.json")
        traffic_dir.mkdir(parents=True, exist_ok=True)

    py = find_python()
    print(f"使用 Python: {py}")
    run([py, str(ROOT / "build_data.py"), "--source", str(shipment_dir)], env={"TTL_DASHBOARD_SOURCE_DIR": str(shipment_dir)})
    run(
        [py, str(ROOT / "scripts" / "build_traffic_data.py"), "--source", str(traffic_dir), "--output", str(out_traffic)],
        env={"TRAFFIC_DATA_DIR": str(traffic_dir)},
    )

    mirror_outputs(cfg, out_bundle, out_traffic)

    stamp = ""
    if not args.no_bump_cache:
        stamp = bump_cache_version(cfg)

    publish = cfg.get("publish", True) and not args.no_publish
    if publish and os.environ.get("GITHUB_ACTIONS") != "true":
        git_publish(cfg, stamp)
    elif publish and os.environ.get("GITHUB_ACTIONS") == "true":
        print("CI 模式：请在 workflow 中单独执行 git commit / push。")


if __name__ == "__main__":
    main()
