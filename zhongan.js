/**
 * 通用请求头参数捕获模板
 * Loon 插件通用版
 * Author: 你自己
 * 
 * 📌 使用步骤：
 * 1. 修改 targetHeader 为你要抓取的 header 名（支持大小写）
 * 2. 修改 storageKey 为你希望保存到 Loon 的 key
 * 3. Loon 插件配置 pattern 改为你目标域名
 */

// ========================== 配置区 ==========================
const targetHeader = "access-token"; // 你要抓取的 header key（支持大小写）
const storageKey = "captured_token"; // 存储到 Loon 本地的 key 名称
// ===========================================================

if ($request && $request.headers) {
    const token = $request.headers[targetHeader.toLowerCase()] || $request.headers[targetHeader];

    if (token) {
        $persistentStore.write(token, storageKey);
        console.log(`✅ 成功捕获 ${targetHeader}: ${token}`);
        $notify("参数获取成功", "", `${targetHeader}: ${token}`);
    } else {
        console.log(`⚠️ 未在请求头中找到 ${targetHeader}`);
    }
}

$done({});
