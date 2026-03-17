#!/bin/bash
# 检测当前环境类型

if [ "$(uname)" = "Darwin" ]; then
  echo "mac"
elif [ "$(cat /etc/os-release 2>/dev/null | grep -c "AlmaLinux")" -gt 0 ]; then
  echo "vps"
else
  echo "unknown"
fi
