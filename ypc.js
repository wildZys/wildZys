// ==Quantumult X 脚本==

/*^重写
https://ypc-services.shanghaicang.com.cn/vip-member-service/app/checkUser url script-request-body ypc.js

mitm ypc-services.shanghaicang.com.cn
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
            // 第一层解析：解析请求体
            let req_data = JSON.parse(req_body);
            
            // 直接提取 token (顶层字段)
            token = req_data.token || "";

            // 特殊处理 bizData：它是一个字符串，需要二次解析
            let bizDataStr = req_data.bizData;
            if (bizDataStr) {
                // 第二层解析：解析 bizData 字符串
                let bizDataObj = JSON.parse(bizDataStr);
                userId = bizDataObj.userId || "";
            }

            console.log(`🔍 抓包解析 -> userId: ${userId}, token: ${token}`);

        } catch (e) {
            console.log(` 请求体处理异常: ${e.message}`);
        }
    }

    // 只有当 userId 和 token 都存在时才存储
    if (userId && token) {
        let ypcValue = `${userId}#${token}`;
        console.log(`✅ 成功拼接 ypc 变量: ${ypcValue}`);

        // 存储数据
        let saveSuccess = $prefs.setValueForKey(ypcValue, "ypc");
        if (saveSuccess) {
            console.log("💾 ypc 变量保存成功");
            $notify("一品仓", "Token获取成功", `账号: ${userId}`);
        }
    } else {
        console.log("❌ 数据缺失，未执行存储");
    }

} catch (error) {
    console.log(`🚨 脚本崩溃: ${error.message}`);
}

$done({});