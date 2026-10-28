import { executeToolCall } from '../js/tools.mjs';

self.onmessage = ({ data }) => {
  if (data?.id !== 1) return;
  const result = executeToolCall(data.call, { allowLocalCompute: data.permissionScope === 'local_compute_only' });
  self.postMessage({ id: 1, result });
};
