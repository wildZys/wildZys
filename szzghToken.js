const url = $request.url;
const headers = $request.headers;
const body = $request.body;

let token = "";
let mobile = "";
//let userId = "";

// ========== 抓 Token ==========
// 常见位置：Header 中的 Authorization / token / X-Token
if (headers["Authorization"]) {
    token = headers["Authorization"].replace("Bearer ", "").trim();
} else if (headers["authorization"]) {
    token = headers["authorization"].replace("Bearer ", "").trim();
} else if (headers["token"]) {
    token = headers["token"].trim();
} else if (headers["X-Token"]) {
    token = headers["X-Token"].trim();
} else if (headers["x-token"]) {
    token = headers["x-token"].trim();
}

// ========== 解析请求体 ==========
let bodyObj = {};
try {
    if (body) {
        // 尝试 JSON 解析
        bodyObj = JSON.parse(body);
    }
} catch (e) {
    // 尝试 URL 编码格式解析（application/x-www-form-urlencoded）
    try {
        body.split("&").forEach(pair => {
            const [key, value] = pair.split("=");
            bodyObj[decodeURIComponent(key)] = decodeURIComponent(value || "");
        });
    } catch (e2) {
        console.log("请求体解析失败: " + e2);
    }
}

// ========== 抓 mobile ==========
if (bodyObj.mobile) {
    mobile = bodyObj.mobile;
} else if (bodyObj.phone) {
    mobile = bodyObj.phone;
} else if (bodyObj.phoneNumber) {
    mobile = bodyObj.phoneNumber;
}


// ========== 如果 token 在请求体里 ==========
if (!token && bodyObj.token) {
    token = bodyObj.token;
}
if (!token && bodyObj.accessToken) {
    token = bodyObj.accessToken;
}
if (!token && bodyObj.access_token) {
    token = bodyObj.access_token;
}

// ========== 组合输出格式 ==========
if (mobile || token) {
    const result = `${mobile}#${token}`;
    
    
		console.log("==== lsapp 抓包结果 ====");
    console.log("URL: " + url);
    console.log("结果: " + result);
    
    // 持久化存储
    $persistentStore.write(result, "lsapp_capture_result");
    
    // 发送通知
    $notification.post(
        "lsapp 抓包成功 🎉",
        result
    );
}

// 不修改请求，直接放行
$done({});