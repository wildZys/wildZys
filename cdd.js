/*
餐大大签到插件
支持Loon，支持多账号，支持一键清理

📢 功能：
1. 抓 token（请求头自动抓）
2. 定时签到（多账号）
3. 一键清理账号（通过请求特殊地址触发）

==============================
【配置】

[Script]
# 定时签到
cron "0 9 * * *" script-path=candashi.js,tag=餐大大签到

# 抓 token & 清理 token
http-request ^https:\/\/app\.candashi\.cn\/api\/api\/v2\/user\/api_user_sign_in|https:\/\/candashi\.clear url script-request-header candashi.js

[MITM]
hostname = app.candashi.cn

==============================
*/

const isRequest = typeof $request !== "undefined";
const isLoon = typeof $loon !== "undefined";

const storageKey = "candashi_tokens";

// 请求类型处理
if (isRequest) {
    if ($request.url.includes("candashi.clear")) {
        // 清除所有 token
        $persistentStore.write("", storageKey);
        console.log("✅ 已清理所有 token");
        $notification.post("餐大大签到", "账号清理成功", "已清空所有账号");
        $done({});
    } else {
        // 抓 token
        const token = $request.headers['token'];
        if (token) {
            let tokens = $persistentStore.read(storageKey) || "";
            if (!tokens.includes(token)) {
                tokens = tokens ? tokens + "@" + token : token;
                $persistentStore.write(tokens, storageKey);
                console.log("✅ 成功获取 token：" + token);
                $notification.post("餐大大签到", "获取Token成功", token);
            } else {
                console.log("⚠️ 已存在 token：" + token);
            }
        }
        $done({});
    }
} else {
    // 定时签到
    let tokens = $persistentStore.read(storageKey);
    if (!tokens) {
        console.log("❌ 未获取到 token，请先抓取 token");
        $notification.post("餐大大签到", "签到失败", "未获取到 token，请先抓取 token");
        $done();
    } else {
        tokens = tokens.split("@");
        console.log(`📢 共获取到 ${tokens.length} 个账号`);

        (async () => {
            for (let i = 0; i < tokens.length; i++) {
                await signIn(i + 1, tokens[i]);
            }
            $done();
        })();
    }
}

// 签到方法
function signIn(index, token) {
    return new Promise((resolve) => {
        const url = "https://app.candashi.cn/api/api/v2/user/api_user_sign_in";
        const headers = {
            'content-length': '139',
            'nonce': '365371',
            'user-agent': 'Dart/3.3 (dart:io)',
            'timestamp': '1720974384204',
            'application': 'cdd-app',
            'content-type': 'application/json;charset=UTF-8',
            'accept-encoding': 'gzip',
            'traceid': 'f06dc29068a910879ca38d88205e54e2',
            'appchannel': 'App Store',
            'appversion': '3.0.12',
            'sign': '2ArCict1MXbQ8RpkTkDb+gMxsH0i8mAav3zrchBTepE=',
            'host': 'app.candashi.cn',
            'token': token
        };
        const body = {
            "json": "eHeQnMgmYH0y23CjwcTL42Rx9RxxxJjALBEMrs6ULIp5DTzCbo1Gg+pUpPraK84dX3ArMRKVA+4C9+Bvp1DdEk3XUY52dmyLKFcURHuGVPwDIYPn7JtHeCfHGf68Hj65"
        };

        const request = {
            url: url,
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        };

        $httpClient.post(request, function (error, response, data) {
            if (error) {
                console.log(`❌ 账号${index}请求失败: ${error}`);
                $notification.post("餐大大签到", `账号${index}签到失败`, `${error}`);
            } else {
                try {
                    const result = JSON.parse(data);
                    console.log(`✅ 账号${index}签到结果: ${result.message}`);
                    $notification.post("餐大大签到", `账号${index}签到结果`, `${result.message}`);
                } catch (e) {
                    console.log(`⚠️ 账号${index}响应解析失败: ${e}`);
                    $notification.post("餐大大签到", `账号${index}签到异常`, `响应解析失败`);
                }
            }
            resolve();
        });
    });
}
