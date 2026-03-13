/*原生平台直接返回客户端值，无需服务端渲染区分。 */
export function useClientOnlyValue<S, C>(_server: S, client: C): S | C {
  return client;
}
