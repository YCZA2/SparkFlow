// Expo Config Plugin: 自动修改 Podfile 使用清华源
// 使用方法: 在 app.json 中配置 plugins: ["./plugins/withTsinghuaPodsource.js"]

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withTsinghuaPodsource(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (fs.existsSync(podfilePath)) {
        let content = fs.readFileSync(podfilePath, 'utf-8');

        // 如果还没有添加清华源，则在文件开头添加
        if (!content.includes('mirrors.tuna.tsinghua.edu.cn')) {
          content = `# 使用清华 CocoaPods 镜像源（CDN 加速）
source 'https://cdn.cocoapods.org/'

# 使用清华 CocoaPods 镜像源（Git 镜像）
source 'https://mirrors.tuna.tsinghua.edu.cn/git/CocoaPods/Specs.git'

${content}`;
          fs.writeFileSync(podfilePath, content);
          console.log('[Config Plugin] 已修改 Podfile 使用清华源 + CDN');
        }
      }

      return config;
    },
  ]);
}

module.exports = withTsinghuaPodsource;
