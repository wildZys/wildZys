/*^
[rewrite_remote]
^https:\/\/ypc-services\.shanghaicang\.com\.cn\/vip-member-service\/app\/checkUser url script-request-body https://raw.githubusercontent.com/wildZys/wildZys/refs/heads/main/ypc.js

[mitm]
hostname = ypc-services.shanghaicang.com.cn

[task_local]
# 这里只是一个示例，根据你的需求填写
# 0 0 * * * https://raw.githubusercontent.com/wildZys/wildZys/refs/heads/main/ypc.js, tag=一品仓签到, img-url=https://example.com/icon.png, enabled=true
*/

// ===== 跨平台存储封装 =====
function readValue(key) {
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
    return null;
}

function writeValue(val, key) {
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(val, key);
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(val, key);
    return false;
}

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

            // ===== 解析数据 =====
            let req_data = JSON.parse(req_body);

            token = req_data.token || "";

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

            // ===== 读取账号数据 =====
            let allAccounts = [];
            let storedData = readValue("ypc");

            if (storedData) {
                try {

                    let parsed = JSON.parse(storedData);

                    if (Array.isArray(parsed)) {
                        allAccounts = parsed;

                    } else if (typeof parsed === "string") {
                        if (parsed.includes("#")) {
                            allAccounts = [parsed];
                        }
                    }

                } catch (e) {
                    console.log("⚠ 数据解析错误，重置账号列表");
                }
            }

            // ===== 去重检查 =====
            let exists = allAccounts.some(account => {
                if (!account.includes("#")) return false;
                return account.split("#")[0] === userId;
            });

            if (exists) {
                console.log(`ℹ️ 账号 ${userId} 已存在，跳过存储`);
                $done({});
                return;
            }

            // ===== 添加账号 =====
            let newAccount = `${userId}#${token}`;
            allAccounts.push(newAccount);

            console.log(`✅ 已添加账号，当前共 ${allAccounts.length} 个账号`);

            // ===== 保存数据 =====
            let saveSuccess = writeValue(JSON.stringify(allAccounts), "ypc");

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
