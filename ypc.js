
// ==一品仓获取Cookie 

/*^
[rewrite_remote]
^https:\/\/ypc-services\.shanghaicang\.com\.cn\/vip-member-service\/app\/checkUser url script-request-body https://raw.githubusercontent.com/wildZys/wildZys/refs/heads/main/ypc.js

[mitm]
hostname = ypc-services.shanghaicang.com.cn

[task_local]
# 这里只是一个示例，根据你的需求填写
# 0 0 * * * https://raw.githubusercontent.com/wildZys/wildZys/refs/heads/main/ypc.js, tag=一品仓签到, img-url=https://example.com/icon.png, enabled=true
*/

try {
    if (typeof $request === 'undefined') {
        console.log("⚠️ ypc.js: $request 未定义");
        $done({});
        return;
    }

    const req_url = $request.url;
    const req_body = $request.body;

    // 仅处理目标接口
    if (!req_url.includes("/vip-member-service/app/checkUser")) {
        $done({});
        return;
    }

    let userId = "";
    let token = "";

    if (req_body) {
        try {
            // --- 1. 解析数据 ---
            let req_data = JSON.parse(req_body);
            
            // 提取顶层 Token
            token = req_data.token || "";
            
            // 解析 bizData 里的 UserId
            let bizDataStr = req_data.bizData;
            if (bizDataStr) {
                let bizDataObj = JSON.parse(bizDataStr);
                userId = bizDataObj.userId || "";
            }

            if (!userId || !token) {
                console.log("❌ 解析失败，缺少 userId 或 token");
                $done({});
                return;
            }

            console.log(`🔍 捕获新账号 -> userId: ${userId}`);

            // --- 2. 处理多账号逻辑 ---
            // 2.1 读取已存在的所有账号 (从存储中读取 JSON 字符串并解析为数组)
            let allAccounts = [];
            let storedData = $prefs.valueForKey("ypc");
            
            if (storedData) {
                try {
                    // 尝试解析旧数据
                    let parsed = JSON.parse(storedData);
                    // 确保解析出来的是数组
                    if (Array.isArray(parsed)) {
                        allAccounts = parsed;
                    } else {
                        // 如果旧数据不是数组（比如是旧格式的字符串），尝试修复或初始化
                        console.log("⚠️ 检测到旧数据格式，尝试迁移...");
                        // 简单处理：如果是单个账号字符串，将其转为数组
                        if (typeof parsed === "string" && parsed.includes("#")) {
                            allAccounts = [parsed];
                        }
                    }
                } catch (e) {
                    console.log(" 数据解析错误，重置账号列表");
                }
            }

            // 2.2 去重检查：检查当前 userId 是否已存在
            let exists = allAccounts.some(account => {
                // account 格式为 "userId#token"
                return account.split("#") === userId;
            });

            if (exists) {
                console.log(`ℹ️ 账号 ${userId} 已存在，跳过存储`);
                $done({});
                return;
            }

            // 2.3 添加新账号
            let newAccount = `${userId}#${token}`;
            allAccounts.push(newAccount);
            console.log(`✅ 已添加账号，当前共 ${allAccounts.length} 个账号`);

            // --- 3. 保存数据 ---
            // 将数组转换回 JSON 字符串存储
            let saveSuccess = $prefs.setValueForKey(JSON.stringify(allAccounts), "ypc");
            
            if (saveSuccess) {
                console.log("💾 多账号数据保存成功");
                $notify("一品仓", "新账号绑定成功", `账号: ${userId}\n当前总数: ${allAccounts.length}`);
            }

        } catch (e) {
            console.log(`🚨 脚本执行异常: ${e.message}`);
        }
    }

} catch (error) {
    console.log(`🚨 脚本崩溃: ${error.message}`);
}

$done({});
