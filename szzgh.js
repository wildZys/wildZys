/**
 * 逻辑说明：
 * 从 Headers 中读取 Cookie，正则匹配 JSESSIONID，忽略其余参数。
 */

const header = $request.headers;
const cookie = header['Cookie'] || header['cookie'];

if (cookie) {
    // 正则表达式：匹配 JSESSIONID=xxx 直到遇到分号或结尾
    const match = cookie.match(/JSESSIONID=[^;]+/);
    
    if (match) {
        const cleanCookie = match[0]; // 获取匹配到的唯一片段
        
        // 存储到本地，Key为 szzgh_jsessionid
        const isSuccess = $persistentStore.write(cleanCookie, "szzgh_jsessionid");
        
        if (isSuccess) {
            $notification.post("szzgh 获取成功", "已过滤无关参数", "当前保存: " + cleanCookie);
            console.log("成功保存精准Cookie: " + cleanCookie);
        }
    } else {
        console.log("未在Cookie中找到JSESSIONID");
    }
}

$done({});
