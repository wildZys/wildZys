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

/**
 * ZhongAn access-token 捕获插件
 * 适用于 Loon，支持持久化保存
 * Author: 你自己
 */

const tokenKey = "zhongan_token"; // 持久化 key 名称

if ($request && $request.headers) {
    const token = $request.headers['access-token'] || $request.headers['Access-Token'];

    if (token) {
        $persistentStore.write(token, tokenKey);
        console.log(`✅ 成功捕获 access-token: ${token}`);
        $notify("ZhongAn Token 获取成功", "", `access-token: ${token}`);
    } else {
        console.log("⚠️ 请求头中未找到 access-token");
    }
}

$done({});
