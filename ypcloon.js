/***********************
 * 通用插件脚本骨架
 * Author: wildZys
[rewrite_remote]
^https:\/\/ypc-services\.shanghaicang\.com\.cn\/vip-member-service\/app\/checkUser url script-request-body https://raw.githubusercontent.com/wildZys/wildZys/refs/heads/main/ypcloon.js

[mitm]
hostname = ypc-services.shanghaicang.com.cn

[task_local]
# 这里只是一个示例，根据你的需求填写
# 0 0 * * * https://raw.githubusercontent.com/wildZys/wildZys/refs/heads/main/ypcloon.js, tag=一品仓签到, img-url=https://example.com/icon.png, enabled=true
************************/

// ===== DEBUG 开关 =====
const DEBUG = false; // 👉 TODO: 可根据需要打开调试日志

// ===== 自动脚本名存储 Key =====
function getScriptKey(defaultName) {
    try {
        if (typeof $script !== "undefined") {
            let name = $script.name || $script.filename;
            if (name) return name.替换(/\.js$/i, "");
        }
    } catch {}
    return defaultName;
}
const STORAGE_KEY = getScriptKey("default"); // 👉 TODO: 默认存储 key，如果不想用脚本名可以改这里

// ===== 环境检测 =====
const Env = {
    isLoon: typeof $loon !== "undefined",
    isQuanX: typeof $task !== "undefined",
    isSurge: typeof $persistentStore !== "undefined" && typeof $httpClient !== "undefined"
};

// ===== 存储封装 =====
function readValue(key) { if (typeof $prefs !== "undefined") return $prefs.valueForKey(key); if (typeof $persistentStore !== "undefined") return $persistentStore.read(key); return null; }
function writeValue(val, key) { if (typeof $prefs !== "undefined") return $prefs.setValueForKey(val, key); if (typeof $persistentStore !== "undefined") return $persistentStore.write(val, key); return false; }

// ===== 日志封装 =====
function log(msg) { console.log(msg); }
function debug(msg) { if (DEBUG) console.log("🐞 " + msg); }

// ===== 通知封装 =====
function notify(title, sub, body) { if (typeof $notify !== "undefined") $notify(title, sub, body); }

// ===== 通用扫描函数 =====
function findValue(str, key) { 
    if (!str) return ""; 
    try { let reg = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`); let match = str.match(reg); if (match) return match[1]; } catch {} 
    try { let reg = new RegExp(`${key}=([^&\\s]+)`); let match = str.match(reg); if (match) return match[1]; } catch {} 
    return ""; 
}

// ===== 获取请求上下文 =====
function getRequestContext() { 
    return { 
        url: $request?.url || "", 
        body: $request?.body || "", 
        headers: JSON.stringify($request?.headers || ""), 
        response: typeof $response !== "undefined" ? $response.body : "" 
    }; 
}

// ===== 通用请求函数（支持 Loon/Surge/QuanX） =====
function httpRequest(options) {
    return new Promise((resolve, reject) => {
        let method = (options.method || "GET").toUpperCase();
        let url = options.url; // 👉 TODO: 替换成你的请求 URL
        let headers = options.headers || {}; // 👉 TODO: 需要的请求头可以在这里加
        let body = options.body || null; // 👉 TODO: POST/PUT 请求 body
        let timeout = options.timeout || 30000;

        let requestData = { url, headers, timeout };
        if (body) requestData.body = body;

        debug(`🌐 请求: ${method} ${url}`);

        // ===== QuanX =====
        if (Env.isQuanX) {
            $task[method.toLowerCase()](requestData).then(resp => {
                resolve({ status: resp.statusCode, headers: resp.headers, body: resp.body });
            }, err => reject(err));
            return;
        }

        // ===== Loon & Surge =====
        if (Env.isLoon || Env.isSurge) {
            $httpClient[method.toLowerCase()](requestData, (err, resp, data) => {
                if (err) reject(err);
                else resolve({ status: resp.status, headers: resp.headers, body: data });
            });
            return;
        }

        reject("🚨 当前运行环境不支持 HTTP 请求");
    });
}

// ===== JSON 解析辅助 =====
function parseJSON(str) { 
    try { return JSON.parse(str); } catch { return null; } 
}

// ===== 多账号管理工具 =====
function loadAccounts() {
    let allAccounts = [];
    let storedData = readValue(STORAGE_KEY);
    if (storedData) {
        try {
            let parsed = JSON.parse(storedData);
            if (Array.isArray(parsed)) allAccounts = parsed;
            else if (typeof parsed === "string" && parsed.includes("#")) allAccounts = [parsed];
        } catch { debug("⚠ 数据损坏，重置列表"); }
    }
    return allAccounts;
}

function saveAccounts(allAccounts) {
    let saveSuccess = writeValue(JSON.stringify(allAccounts), STORAGE_KEY);
    if (saveSuccess) debug("💾 多账号数据保存成功");
}

// ===== 主逻辑入口 =====
async function main() {
    debug("脚本启动");
    debug("当前存储Key：" + STORAGE_KEY);
    // ===== 指定抓取 URL =====
    const TARGET_URL = "https://ypc-services.shanghaicang.com.cn/vip-member-service/app/checkUser"; // 🔴 TODO: 改成你的目标 URL

    // ===== 获取请求上下文 =====
    let ctx = getRequestContext();
    if (!ctx.url.includes(TARGET_URL)) {
        debug(`跳过 URL: ${ctx.url}`);
        return;
    }
    let scanText = [ctx.url, ctx.body, ctx.headers, ctx.response].join("&");

    // ===== 扫描 userId & token =====
    let userId = findValue(scanText, "userId"); // 👉 TODO: 替换成你的项目关键字段
    let token = findValue(scanText, "token");   // 👉 TODO: 替换成你的项目关键字段
    if (userId && token) {
        debug(`🔍 捕获账号 -> ${userId}`);

        let accounts = loadAccounts();
        if (!accounts.some(a => a.split("#")[0] === userId)) {
            accounts.push(`${userId}#${token}`);
            saveAccounts(accounts);
            notify("项目名", "新账号绑定成功", `账号: ${userId}\n当前总数: ${accounts.length}`); // 👉 TODO: 改成你的项目名
            debug(`✅ 已添加账号，共 ${accounts.length} 个`);
        } else {
            debug(`ℹ️ 账号 ${userId} 已存在`);
        }
    }

    /**********************************************************
     *                     批量账号示例开始
     *
     * 下面示例演示如何遍历存储的多个账号进行操作。
     * 你可以在 for 循环里替换成你自己的业务逻辑，比如签到、任务等。
     **********************************************************/
    let accounts = loadAccounts();
    for (let i = 0; i < accounts.length; i++) {
        let [uid, tok] = accounts[i].split("#");

        debug(`⏳ 正在处理账号 ${i + 1}/${accounts.length}: ${uid}`);

        // ===== 示例请求 =====
        // 👉 TODO: 改成你的业务请求接口
        try {
            let res = await httpRequest({
                url: "https://api.example.com/dosomething", // 👉 TODO: 替换成你的接口
                method: "GET", // 👉 TODO: GET/POST/PUT/DELETE
                headers: { token: tok } // 👉 TODO: 根据接口添加请求头
                // body: JSON.stringify({}) // 👉 TODO: POST/PUT 请求需要 body
            });

            let data = parseJSON(res.body); // 👉 TODO: 根据接口返回类型解析
            debug(`账号 ${uid} 返回数据: ${JSON.stringify(data)}`);

            // ===== 示例通知 =====
            // 👉 TODO: 自定义处理逻辑
            notify(`账号 ${uid} 处理完成`, "", JSON.stringify(data));

        } catch (err) {
            debug(`❌ 账号 ${uid} 请求失败: ${err}`);
        }

        // ===== 可选：延时，防止频繁请求被封 =====
        await new Promise(r => setTimeout(r, 1000)); // 👉 TODO: 根据需求修改延时
    }
    /**********************************************************
     *                     批量账号示例结束
     **********************************************************/
}

// ===== 启动 =====
(async () => {
    try { await main(); } catch (e) { console.log("🚨 脚本异常:", e); }
    finally { $done({}); }
})();
