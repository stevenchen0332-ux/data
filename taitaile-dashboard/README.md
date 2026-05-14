# 太太乐全渠道经营驾驶舱发布版

这是一个可直接发布的静态网站版本，入口文件是 `index.html`。页面不依赖后端，数据已内嵌在同目录的 `data-bundle.js` 中。

## 本地预览

直接双击 `index.html`，或在当前目录执行：

```bash
python3 -m http.server 8080
```

然后打开：

```text
http://localhost:8080
```

## 发布方式

可以把整个 `taitaile-dashboard-site` 文件夹上传到任意静态网站平台：

- Netlify：拖拽整个文件夹发布
- Vercel：导入该目录作为静态项目
- GitHub Pages：上传本目录内容并开启 Pages
- 企业服务器：将本目录内容放到 Nginx / Apache 静态目录

## Git 发布

本目录已经初始化为独立 Git 仓库并完成首次提交。由于当前电脑没有安装 GitHub CLI，也没有配置远程仓库地址，所以还不能自动推送到线上。

拿到远程仓库地址后，在本目录执行：

```bash
git remote add origin <你的远程仓库地址>
git push -u origin main
```

如果用 GitHub Pages，仓库 Settings → Pages 里选择 `main` 分支和 `/root` 目录即可。

## 文件说明

- `index.html`：页面结构
- `style.css`：视觉样式
- `script.js`：筛选、计算、图表和洞察逻辑
- `data-bundle.js`：已清洗汇总后的发布数据包
- `echarts.min.js`：图表库
- `online-source-audit.json`：在线文档访问与字段识别结果

## 注意

发布给外部人员前，请确认 `data-bundle.js` 中的数据可以对外展示。静态网站的数据文件会被访问者下载到浏览器中。

当前发布数据包已纳入两类本地数据：

- `/Users/chenjiwei/Desktop/日数据`：1-5 月出货 CSV
- `/Users/chenjiwei/Desktop/日数据/流量`：已下载的流量、GMV、转化、推广 Excel

线上金山 / 腾讯文档仍只作为来源参考；发布页不依赖在线接口。
