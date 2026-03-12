/*Web 端不启用本地 SQLite 镜像，避免开发启动时解析 expo-sqlite wasm。 */
function buildUnsupportedError(): Error {
  return new Error('Web 端暂不支持本地 SQLite 镜像');
}

/*Web 端显式拒绝打开 SQLite，提醒调用方走远端或内存降级。 */
export async function getSQLiteClient(): Promise<never> {
  throw buildUnsupportedError();
}

/*Web 端显式拒绝创建 Drizzle 实例，避免误用到 native-only 存储层。 */
export async function getLocalDatabase(): Promise<never> {
  throw buildUnsupportedError();
}

/*Web 启动阶段跳过本地数据库预热，让 Router 至少能正常进入。 */
export async function ensureLocalDatabaseReady(): Promise<void> {
  return;
}
