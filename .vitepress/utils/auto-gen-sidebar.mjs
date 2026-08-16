import path from "node:path";
import fs from "node:fs";

const DIR_PATH = path.resolve();
const SRC_DIR = "docs"; // 与 VitePress 的 srcDir 保持一致

// 白名单（可根据需要调整）
const WHITE_LIST = [".vitepress", "node_modules", ".idea", "assets", "index.md"];

const isDirectory = (p) => fs.lstatSync(p).isDirectory();

const intersections = (arr1, arr2) =>
  Array.from(new Set(arr1.filter((item) => !new Set(arr2).has(item))));

function getList(params, currentDir, pathname) {
  const res = [];
  for (let file in params) {
    const fullPath = path.join(currentDir, params[file]);
    const isDir = isDirectory(fullPath);

    if (isDir) {
      const files = fs.readdirSync(fullPath);
      res.push({
        text: params[file],
        collapsed: true,
        items: getList(files, fullPath, `${pathname}/${params[file]}`),
      });
    } else {
      const fileName = params[file];
      const suffix = path.extname(fileName);
      if (suffix !== ".md") continue;

      // 去掉 .md 后缀
      const nameWithoutMd = fileName.replace(/\.md$/, "");
      // 去除 pathname 中的 SRC_DIR 前缀（如 "docs/Examples" → "Examples"）
      const relativePath = pathname.replace(new RegExp(`^${SRC_DIR}/?`), "");
      // 拼接正确的链接（不带 .md，不带 docs/）
      const link = relativePath ? `${relativePath}/${nameWithoutMd}` : nameWithoutMd;

      res.push({
        text: nameWithoutMd,
        link: link,
      });
    }
  }
  return res;
}

export const set_sidebar = (pathname) => {
  const dirPath = path.join(DIR_PATH, pathname);
  console.log(`[AutoSidebar] 目标路径: ${dirPath}`);

  if (!fs.existsSync(dirPath)) {
    console.error(`[AutoSidebar] ❌ 路径不存在！请检查: ${dirPath}`);
    return [];
  }

  const files = fs.readdirSync(dirPath);
  console.log(`[AutoSidebar] 读取到的文件/文件夹:`, files);

  const items = intersections(files, WHITE_LIST);
  console.log(`[AutoSidebar] 过滤白名单后:`, items);

  const result = getList(items, dirPath, pathname);
  console.log(`[AutoSidebar] 最终生成:`, JSON.stringify(result, null, 2));
  return result;
};