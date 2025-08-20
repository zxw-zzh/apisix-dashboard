// This file can be generated at deploy-time from environment variables.
// Example placeholders below can be replaced by your CI/CD or entrypoint.
window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {
  // 前端同源反代 Admin：/admin-api → 后端 9180 的 /apisix/admin/
  APISIX_ADMIN_URL: window.location.origin.replace(/\/$/, '') + '/admin-api',
  // Admin API Key（按实际环境填写）
  APISIX_ADMIN_KEY: "edd1c9f034335f136f87ad84b625c8f1",
  // 网关地址：走前端同源反代 /api
  APISIX_GATEWAY_URL: window.location.origin.replace(/\/$/, '')
};


