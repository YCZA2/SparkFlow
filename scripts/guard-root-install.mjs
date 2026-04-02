#!/usr/bin/env node

/**
 * 负责阻止在仓库根目录误执行 npm install / npm ci。
 */
function shouldAllowRootInstall() {
  return process.env.ALLOW_ROOT_NPM_INSTALL === "1";
}

/**
 * 负责输出根目录安装的纠正提示。
 */
function printGuidance() {
  const lines = [
    "",
    "[sparkflow] 已阻止在仓库根目录执行 npm install / npm ci。",
    "[sparkflow] 这个仓库真正的前端依赖位于 mobile/package.json。",
    "[sparkflow] 请改为执行：",
    "[sparkflow]   cd mobile && npm install",
    "[sparkflow] 如果你确实需要跳过保护，请显式使用：",
    "[sparkflow]   ALLOW_ROOT_NPM_INSTALL=1 npm install",
    "",
  ];

  process.stderr.write(`${lines.join("\n")}\n`);
}

/**
 * 负责执行根目录安装保护主流程。
 */
function main() {
  if (shouldAllowRootInstall()) {
    return;
  }

  printGuidance();
  process.exit(1);
}

main();
